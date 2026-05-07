-- 0006_summary_and_bullets.sql — adds M5 plain-English summary and
-- bullet-level analysis to perception_reports.
--
-- Both columns nullable: plain_summary may legitimately be null when
-- Claude (the synthesis call) fails or when 0 LLMs/parsers responded;
-- bullet_analysis is null when parse_resume failed entirely.
--
-- Idempotent (matches the M2-M4 migration pattern).

alter table perception_reports
  add column if not exists plain_summary jsonb,
  add column if not exists bullet_analysis jsonb;
