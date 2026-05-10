-- 0007_target_jd.sql — adds the optional job-description text captured on the
-- M8 /upload form. Plumbs through the perception graph so the q4 (fit),
-- q3 (top_strengths), and q7 (missing_signal) queries can be conditioned
-- on the actual JD the candidate is targeting, not just the role title.
--
-- Idempotent (matches the M2-M6 migration pattern). Existing rows get null;
-- the perception graph treats null as "no JD context" and falls back to the
-- M6 role-only / role+company / inferred branches.
--
-- The JD is stored as raw text. Image-of-JD uploads are OCR'd via lib/ocr.ts
-- before insert, so the column always holds plain text regardless of input
-- mode.

alter table resumes
  add column if not exists target_jd text;
