-- 0008_input_kind.sql — track which upload mode produced this resume row
-- (M8.C). PDF is the historical default; URL and image are the new M8 paths.
--
-- Idempotent (matches the M2-M7 migration pattern). Existing rows default
-- to 'pdf'. The CHECK constraint guards against typos in app code.

alter table resumes
  add column if not exists input_kind text not null default 'pdf';

alter table resumes
  drop constraint if exists resumes_input_kind_check;

alter table resumes
  add constraint resumes_input_kind_check
  check (input_kind in ('pdf', 'url', 'image'));
