-- 0001_baseline.sql — verbatim port of the original lib/supabase/schema.sql.
-- Idempotent so it can run on a fresh project AND on the existing project
-- without re-creating already-present objects.

create extension if not exists "uuid-ossp";

-- Candidates (extends auth.users)
create table if not exists candidates (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  linkedin_url text,
  created_at timestamptz default now()
);

-- Resumes
create table if not exists resumes (
  id uuid default uuid_generate_v4() primary key,
  candidate_id uuid references candidates on delete cascade not null,
  file_path text not null,
  file_name text not null,
  raw_text text,
  created_at timestamptz default now()
);

-- Parse results — one row per parser per resume
create table if not exists parse_results (
  id uuid default uuid_generate_v4() primary key,
  resume_id uuid references resumes on delete cascade not null,
  parser_name text not null,
  raw_output jsonb,
  structured_data jsonb,
  parse_score numeric(3,2),
  issues jsonb default '[]'::jsonb,
  parsed_at timestamptz default now()
);

-- LLM responses — one row per prompt per model per resume
create table if not exists llm_responses (
  id uuid default uuid_generate_v4() primary key,
  resume_id uuid references resumes on delete cascade not null,
  model_name text not null,
  prompt_key text not null,
  prompt_text text not null,
  response_text text not null,
  latency_ms integer,
  responded_at timestamptz default now()
);

-- Perception reports — aggregated analysis per resume
create table if not exists perception_reports (
  id uuid default uuid_generate_v4() primary key,
  resume_id uuid references resumes on delete cascade unique not null,
  report jsonb not null,
  generated_at timestamptz default now()
);

-- Row Level Security (idempotent — enabling twice is a no-op)
alter table candidates enable row level security;
alter table resumes enable row level security;
alter table parse_results enable row level security;
alter table llm_responses enable row level security;
alter table perception_reports enable row level security;

-- Policies: pg < 17 has no "create policy if not exists", so guard with DO blocks.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'users view own profile' and tablename = 'candidates') then
    create policy "users view own profile" on candidates for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'users update own profile' and tablename = 'candidates') then
    create policy "users update own profile" on candidates for update using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'users insert own profile' and tablename = 'candidates') then
    create policy "users insert own profile" on candidates for insert with check (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'users view own resumes' and tablename = 'resumes') then
    create policy "users view own resumes" on resumes for select using (auth.uid() = candidate_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'users insert own resumes' and tablename = 'resumes') then
    create policy "users insert own resumes" on resumes for insert with check (auth.uid() = candidate_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'users delete own resumes' and tablename = 'resumes') then
    create policy "users delete own resumes" on resumes for delete using (auth.uid() = candidate_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'users view own parse results' and tablename = 'parse_results') then
    create policy "users view own parse results" on parse_results for select
      using (exists (select 1 from resumes where resumes.id = parse_results.resume_id and resumes.candidate_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'users view own llm responses' and tablename = 'llm_responses') then
    create policy "users view own llm responses" on llm_responses for select
      using (exists (select 1 from resumes where resumes.id = llm_responses.resume_id and resumes.candidate_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'users view own perception reports' and tablename = 'perception_reports') then
    create policy "users view own perception reports" on perception_reports for select
      using (exists (select 1 from resumes where resumes.id = perception_reports.resume_id and resumes.candidate_id = auth.uid()));
  end if;
end $$;

-- Auto-create candidate profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into candidates (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Storage bucket "resumes" must be created in the Supabase dashboard with private access.
