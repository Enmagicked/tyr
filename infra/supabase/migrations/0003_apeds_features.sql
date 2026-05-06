-- 0003_apeds_features.sql — adds APEDS LLM disagreement persistence (M3).
--
-- Three changes:
--  1. perception_reports gains apeds_features (jsonb), ai_legibility_score
--     (0..100 integer), and normalization_issues (jsonb).
--  2. New perception_query_responses table — one row per (resume, model,
--     query_key) tuple. Replaces llm_responses as the source of truth for
--     perception data (llm_responses kept for audit; M13 deprecation).
--  3. Both alterations are idempotent (`add column if not exists`,
--     `create table if not exists`, policy guards via pg_policies lookup).

alter table perception_reports
  add column if not exists apeds_features jsonb,
  add column if not exists ai_legibility_score integer
    check (ai_legibility_score is null or (ai_legibility_score >= 0 and ai_legibility_score <= 100)),
  add column if not exists normalization_issues jsonb not null default '[]'::jsonb;

-- M3: report can be null when all 4 LLMs fail and only an apeds_features
-- audit row is written. Baseline declared NOT NULL; relax it now.
alter table perception_reports alter column report drop not null;

create table if not exists perception_query_responses (
  id uuid default uuid_generate_v4() primary key,
  resume_id uuid references resumes on delete cascade not null,
  model_name text not null,
  query_key text not null,
  scalar numeric,
  list_value jsonb,
  text_value text,
  reasoning text not null,
  reasoning_embedding_hash text not null,    -- SHA256(reasoning), embedding stored in cache only
  cache_hit boolean not null default false,
  latency_ms integer,
  responded_at timestamptz default now(),
  unique (resume_id, model_name, query_key)
);

alter table perception_query_responses enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'perception_query_responses'
      and policyname = 'users view own perception query responses'
  ) then
    create policy "users view own perception query responses" on perception_query_responses for select
      using (exists (
        select 1 from resumes
        where resumes.id = perception_query_responses.resume_id
          and resumes.candidate_id = auth.uid()
      ));
  end if;
end $$;

create index if not exists perception_query_responses_resume_id_idx
  on perception_query_responses (resume_id);

create index if not exists perception_query_responses_model_query_idx
  on perception_query_responses (model_name, query_key);
