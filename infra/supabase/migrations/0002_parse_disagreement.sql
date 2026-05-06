-- 0002_parse_disagreement.sql — adds canonical_data + normalization_issues to
-- parse_results, and the new parse_disagreement table that holds per-resume
-- cross-parser variance metrics (M2).

alter table parse_results
  add column if not exists canonical_data jsonb,
  add column if not exists normalization_issues jsonb not null default '[]'::jsonb;

create table if not exists parse_disagreement (
  id uuid default uuid_generate_v4() primary key,
  resume_id uuid references resumes on delete cascade unique not null,
  field_disagreement jsonb not null,
  experience_alignment numeric(4,3),       -- nullable when only 1 parser survived
  bullet_count_variance numeric,
  overall_score numeric(4,3),              -- nullable when only 1 parser survived
  parser_pair_diffs jsonb not null,
  computed_at timestamptz default now()
);

alter table parse_disagreement enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'parse_disagreement'
      and policyname = 'users view own parse disagreement'
  ) then
    create policy "users view own parse disagreement" on parse_disagreement for select
      using (exists (
        select 1 from resumes
        where resumes.id = parse_disagreement.resume_id
          and resumes.candidate_id = auth.uid()
      ));
  end if;
end $$;

-- Service-role inserts (no candidate-side insert policy needed — graph runs
-- server-side under service role).
