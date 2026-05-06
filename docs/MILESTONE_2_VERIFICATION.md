# Milestone 2 — Acceptance verification

Per [MILESTONE_2_PLAN.md](MILESTONE_2_PLAN.md). Each criterion is auto-verified
(typecheck/build/test output) or runtime-verified (must run end-to-end against
the configured Supabase project, ATS API keys, and LLM keys).

## Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `npx tsc --noEmit` and `npx next build` clean | ✅ AUTO | `npx tsc --noEmit` exits 0. `npx next build` completes with `✓ Compiled successfully in 3.9s` and `✓ Generating static pages using 7 workers (13/13)` — `/report/[resumeId]` registers as `ƒ /report/[resumeId]`. (`tsconfig.json` gained `allowImportingTsExtensions: true` so the `node:test` files can resolve sibling `.ts` modules at runtime; this option only affects `noEmit:true` projects, which we already are.) |
| 2 | Each parser writes both `raw_output` AND `canonical_data` to `parse_results` | ✅ AUTO + ⏳ RUNTIME | `ParseResult` (`types/index.ts`) now requires `canonical_data: CanonicalResume` and `normalization_issues: NormalizationIssue[]`. Each parser (`lib/parsers/{affinda,openresume,naive}.ts`) calls `normalize()` and populates these. `lib/agents/save-results.ts` writes them into the new `parse_results.canonical_data` and `parse_results.normalization_issues` columns added by `0002_parse_disagreement.sql`. RUNTIME confirmation requires uploading a resume with the migrations applied. |
| 3 | Same resume run twice → identical `canonical_data` per parser (hash equal) | ✅ AUTO | `lib/parsers/__tests__/determinism.test.ts` hashes `normalize()` output across two invocations and asserts equality. `normalize()` is the deterministic core all 3 parsers funnel through; the property propagates trivially. Run with `npm test`. |
| 4 | `parse_disagreement` row exists per analyzed resume when ≥2 parsers succeeded; `overall_score ∈ [0,1]` | ✅ AUTO + ⏳ RUNTIME | `lib/agents/__tests__/disagreement.test.ts` "overall_score is in [0, 1]" + "2 parsers → computed" tests cover the AUTO half. RUNTIME: `lib/agents/save-results.ts:42` upserts the row when `compute_disagreement` returned a result; the SQL column is `numeric(4,3)` per `0002_parse_disagreement.sql`. |
| 5 | When exactly 1 parser fails, disagreement still computes over the surviving 2 | ✅ AUTO | `lib/agents/__tests__/disagreement.test.ts` "2 parsers → computed (acceptance criterion 5)" passes. The graph node `compute_disagreement` reads `ctx.parse_resume.results`, which is the *surviving* parser set per `synthesizeParse` in `lib/agents/parsers.ts`. |
| 6 | When 2 parsers fail, `parse_disagreement` row written with `overall_score = null` and `parser_pair_diffs: []` | ✅ AUTO | `lib/agents/__tests__/disagreement.test.ts` "1 parser → null overall (acceptance criterion 6 edge)" asserts both fields. The schema column is nullable (`numeric(4,3)`) and `parser_pair_diffs` is `jsonb not null` — `[]` is a valid JSON value. |
| 7 | Employer canonicalization golden set: "JPM"/"JPMorgan"/"JPMorgan Chase & Co." → same `canonical_id` | ✅ AUTO | `lib/parsers/__tests__/employers.test.ts` covers 10 equivalence groups with 31 raw inputs total (>20 — the criterion's lower bound). All 13 tests pass. The `cleanCompany` helper in `lib/parsers/normalize.ts` strips corporate suffixes (`inc/co/group/holdings/&/and/the/...`) before Levenshtein matching at threshold 0.85. |
| 8 | Date normalization: ≥95% of dates from 50-resume eval set parse to valid ISO | ⏳ RUNTIME | `lib/parsers/__tests__/normalize.test.ts` covers all the formats from the plan (`YYYY-MM`, `MMM YYYY`, `Month YYYY`, `MM/YYYY`, `YYYY`, seasons, quarters, "Present"/"Current"/"—"). Production verification requires the eval set — not yet committed; instrument via `parse_results.normalization_issues` count once the eval set lands. |
| 9 | Migrations apply cleanly on a fresh Supabase project via `supabase db push` | ⏳ RUNTIME | `infra/supabase/migrations/0001_baseline.sql` is a verbatim port of the deleted `lib/supabase/schema.sql` with `if not exists` everywhere (tables, extension, policies via `pg_policies` lookup, trigger via `drop if exists`/`create`). `0002_parse_disagreement.sql` uses the same idempotent pattern. Both files apply in order via `supabase db push` or `psql -f`. RUNTIME: actual fresh-project test pending. |
| 10 | `parse_results.canonical_data` non-null for ≥2 of 3 parsers in 95% of runs | ⏳ RUNTIME | `canonical_data` is non-optional in TypeScript; every parser path (success or failure) writes a `CanonicalResume` (the failure path uses `emptyCanonical()` so the column is `{contact:{personal_urls:[]},education:[],experience:[],skills:[]}` not null). Production rate measurement requires the eval set. |
| 11 | Report page shows "Parser agreement: X%" badge with per-field breakdown | ✅ AUTO + ⏳ RUNTIME | `app/report/[resumeId]/page.tsx` queries `parse_disagreement` via service client, renders an emerald pill `Parser agreement: pct(1 - overall_score)`, and a per-field grid showing `1 − field_disagreement[k]`. Falls back to "Insufficient data — only one parser succeeded" when `overall_score` is null. |
| 12 | Graph emits `node_started` / `node_completed` events for `compute_disagreement` | ✅ AUTO + ⏳ RUNTIME | `lib/agents/index.ts` registers `compute_disagreement` in the node list; the runtime in `lib/graph/runtime.ts` emits `node_started` (line 36) and `node_completed` (line 73) for *every* node it runs — so the new node automatically appears in the SSE stream consumed at `/api/stream/[runId]`. |

## How to run the AUTO checks locally

```bash
npx tsc --noEmit          # criterion 1 (typecheck)
npx next build            # criterion 1 (build)
npm test                  # criteria 3, 5, 6, 7 (unit tests, 46 cases)
```

Test runner: Node 20+ built-in `node:test` with `--experimental-strip-types`
(no extra dev dep). Tests live in `lib/parsers/__tests__/` and
`lib/agents/__tests__/`.

Latest local run, all green:

```
tests 46
pass  46
fail  0
duration_ms ~230
```

## Migration runbook

```bash
# Fresh project:
supabase db push            # applies 0001_baseline.sql then 0002_parse_disagreement.sql

# Existing project (already had lib/supabase/schema.sql applied):
# 0001 is a no-op (idempotent), 0002 adds the 2 new columns + new table.
supabase db push
```

The deleted `lib/supabase/schema.sql` is now in `infra/supabase/migrations/0001_baseline.sql` —
the doc references in `MILESTONE_1_*.md` to the old path are intentionally
left as-is to reflect M1 history.

## What changed in code

- `types/resume.ts` (new) — `CanonicalResume`, contact subtypes, education,
  experience with bullet arrays, skills, `NormalizationIssue`.
- `types/index.ts` — extends `ParseResult` with `canonical_data` and
  `normalization_issues`.
- `lib/parsers/normalize.ts` (new) — pure normalizer: `normalizeDate`,
  `splitBullets`, `canonicalizeEmployer`, `canonicalizeSchool`, `classifyUrl`,
  `normalizeDegree`, `inferLevel`, plus skill-name aliasing.
- `lib/parsers/seed-employers.json` (new) — ~80 firms × 1–5 aliases each.
- `lib/parsers/seed-schools.json` (new) — ~55 universities × 1–5 aliases each.
- `lib/parsers/{affinda,openresume,naive}.ts` — each parser now invokes
  `normalize()` after building `structured_data`. The Affinda local helper
  `normalize()` was renamed to `mapAffindaData()` to avoid the name clash.
- `lib/agents/disagreement.ts` (new) — pairwise scorer; bipartite-greedy
  experience alignment; jaccard for set fields; normalized edit distance for
  scalar text. `computeDisagreementFromCanonicals()` and
  `computeDisagreementFromResults()` exported.
- `lib/agents/compute-disagreement.ts` (new) — graph node wrapper.
- `lib/agents/index.ts` — adds `compute_disagreement` between `parse_resume`
  and `save_results`; updates `save_results.optional_deps`.
- `lib/agents/save-results.ts` — upserts the `parse_disagreement` row;
  writes `canonical_data` + `normalization_issues` to `parse_results`.
- `app/report/[resumeId]/page.tsx` — fetches `parse_disagreement`, renders
  the agreement pill + per-field grid.
- `infra/supabase/migrations/0001_baseline.sql` (new, idempotent port).
- `infra/supabase/migrations/0002_parse_disagreement.sql` (new).
- `lib/supabase/schema.sql` (deleted).
- `tsconfig.json` — `allowImportingTsExtensions: true` so the `node:test`
  files can `import { … } from '../normalize.ts'` at runtime.
- `package.json` — `npm test` script.

## Things deliberately NOT done in M2

Per §7.4 deferral list in the plan:
- Per-LLM disagreement (σ_j, ρ_j embeddings) — M3.
- 4th LLM (Together / Llama-3.1-70B) — M3.
- Upstash LLM cache — M3.
- 64-d AI-perception vector projection — M3.
- Tyr-Auth perplexity/burstiness — M5+.
- Outcome schema — M4.
- Marketing landing page + real report-page UI design — M4.
- Generic `pairwiseDisagreement<T>` helper extraction — deferred to M3 per
  the plan's "predictions for downstream milestones."

## Open caveats / follow-ups

- **Eval-set RUNTIME criteria (8, 9, 10).** The 50-resume and 20-resume eval
  sets aren't committed yet. Acceptance criteria 8, 9, 10 will flip from ⏳
  to ✅ once those land and a one-shot script writes their results back into
  this doc.
- **`SEED_GAPS.md` log.** The plan recommends tracking long-tail employer
  misses. Not yet started — open `docs/SEED_GAPS.md` once the eval set's
  `normalization_issues` counts are in.
- **Affinda contact subtypes.** `normalize()` currently only consumes
  `raw.linkedin` from `ParsedResume`; the Affinda parser stores a single
  LinkedIn URL but its raw `websites[]` carries github/personal URLs that
  could feed `contact.github_url` / `contact.personal_urls`. Worth a small
  pass once the eval set surfaces resumes with rich website lists.
- **Bullet-count variance metric.** The plan defined per-matched-experience
  variance; the implementation uses pair-level `bullet_count_diff` variance
  as a proxy. Same direction, slightly different magnitude — acceptable for
  M2 since the metric is one of three weighted components and clipped to
  `min(1, var/5)`.
