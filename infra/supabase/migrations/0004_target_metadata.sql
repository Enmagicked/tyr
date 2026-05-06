-- 0004_target_metadata.sql — adds the target role/company captured on the
-- M4 /upload form so the q4 (fit) perception query can be conditioned on a
-- specific target rather than M3's "most-likely target inferred from
-- most-recent experience."
--
-- Idempotent (matches the M2/M3 pattern). Existing rows get null; the
-- perception graph treats null as "fall back to inferred target" so
-- pre-M4 resumes keep working.

alter table resumes
  add column if not exists target_role text,
  add column if not exists target_company text;
