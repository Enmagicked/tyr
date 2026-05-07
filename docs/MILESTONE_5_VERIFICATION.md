# Milestone 5 — Acceptance verification

Per [MILESTONE_5_PLAN.md] (the plan file lives at
`C:\Users\noura\.claude\plans\merry-orbiting-dijkstra.md` for this build).

**M5 goal recap:** keep the M4 measurement infrastructure intact, add a
human-readable narrative on top, give users an account / past-reports
surface, and ship a static sample. All driven by real user feedback during
the M4 prod smoke test ("the report reads as very technical" + "I can't
find my past uploads").

## Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `npx tsc --noEmit` and `npx next build` clean | ✅ AUTO | `npx tsc --noEmit` exits 0. `npx next build` completes with `✓ Compiled successfully in 4.8s` and `✓ Generating static pages using 7 workers (18/18)`. New routes register: `○ /sample`, `○ /reports`, `○ /account`, `ƒ /api/account/delete`. Total route count grew from 14 (M4) to 18. |
| 2 | `/reports` lists user's resumes with file_name, target, parser_agreement %, ai_legibility, sorted by created_at desc | ✅ AUTO + ⏳ RUNTIME | `app/reports/page.tsx` queries `resumes` filtered by `candidate_id = user.id`, ordered `created_at DESC`. Joins `parse_disagreement.overall_score` (→ `1 - overall_score` = parser_agreement) and `perception_reports.ai_legibility_score` via two parallel `IN` queries (cheaper than a Postgres join through PostgREST). Empty-state copy + "Upload your first resume" CTA covered. RUNTIME: needs prod login to verify visually. |
| 3 | `/reports` and `/account` redirect unauthed users to `/login?next=...` | ✅ AUTO | `proxy.ts` `PROTECTED_PREFIXES = ['/upload', '/report', '/reports', '/account']`. Same auth-gate pattern as M4. |
| 4 | `/account` shows email, member-since, report count, sign-out, delete-my-data with email-typed confirmation | ✅ AUTO + ⏳ RUNTIME | `app/account/page.tsx` reads email + `created_at` from `user`, count from `resumes` via `count: 'exact', head: true`. `components/account/account-actions.tsx` (client) implements sign-out via `supabase.auth.signOut()` and a delete-everything button gated by an email-match input — disabled until typed value matches `user.email` (case-insensitive after trim). |
| 5 | Nav shows "Upload", "My reports", "Account" when signed in; default CTA when signed out | ✅ AUTO + ⏳ RUNTIME | `components/landing/nav.tsx` calls `supabase.auth.getUser()` on mount + subscribes to `onAuthStateChange`. Toggles between `ANON_NAV_LINKS` (How it works / Reports / FAQ) + "Decode my resume →" CTA, and `AUTHED_NAV_LINKS` (My reports / Account) + "Upload →" CTA. Pre-mount state is `null` to avoid SSR/CSR hydration mismatch. |
| 6 | Migration `0006` applies cleanly on prod | ⏳ RUNTIME | `infra/supabase/migrations/0006_summary_and_bullets.sql` adds `plain_summary jsonb` and `bullet_analysis jsonb` to `perception_reports`. Both nullable, idempotent (`if not exists`). Pending application via Supabase SQL editor. |
| 7 | `analyze_bullets` returns `{ by_experience, aggregate, source_parser }` | ✅ AUTO | `lib/agents/analyze-bullets.ts` reads `parse_resume.results[]`, picks the highest-`parse_score` parser, runs `bulletMetrics()` per experience, aggregates totals/percentages. Returns null when `parse_resume` had no surviving results. |
| 8 | `bullet-metrics.ts` has ≥15 unit tests for quantification, action-verb, buzzword, char-stats helpers; all pass | ✅ AUTO | `lib/parsers/__tests__/bullet-metrics.test.ts` ships **28 tests** covering each detector in isolation + edge cases (empty bullets, leading bullet glyphs, all-uppercase openers, embedded vs quantified numbers). All pass in `npm test`. |
| 9 | `synthesize_summary` returns valid `PlainSummary` JSON; falls back to null + normalization issue when Claude fails | ✅ AUTO + ⏳ RUNTIME | `lib/agents/synthesize-summary.ts`: cache-first lookup at `apeds_summary:v1:<resume_id>:<features_hash>:<bullet_hash>`, then Claude Sonnet call (max_tokens 1500, temp 0.2), then `repairAndParseJson` (reused from `lib/llm/perceive.ts`), then `validate()` which accepts partial outputs and records `normalization_issues`. Top-level try/catch guarantees null on any error so the graph completes. |
| 10 | `/report/[resumeId]` renders new `<PlainSummarySection>` AFTER the technical sections and BEFORE the caveat | ✅ AUTO | `app/report/[resumeId]/page.tsx` updated layout order: hero → headline scores → parser/perception two-column → inter-modal δ → consensus blocks → **PlainSummarySection** (new) → CaveatCard. Per user direction "tables on top, summary additionally." |
| 11 | Plain-summary text references at least one specific bullet stat from `bullet_analysis` | ⏳ RUNTIME | The prompt in `synthesize-summary.ts:buildPrompt` explicitly instructs Claude to "Cite at least one specific number" + serializes `bulletAnalysis.aggregate` and `by_experience` into the prompt context. Will be qualitatively spot-checked on real prod uploads. |
| 12 | `/sample` renders against the static fixture without auth; banner clearly marks it as synthetic | ✅ AUTO | `app/sample/page.tsx` is a server component, NOT in `proxy.ts` `PROTECTED_PREFIXES` (so it's public). Imports `lib/sample/sample-report.json` and renders the same `<HeadlineScores>`, `<ParserDisagreementCard>`, `<PerceptionGrid>`, `<InterModalDelta>`, consensus blocks, and `<PlainSummarySection>` against the fixture. Top banner: thistle-accented card with "This is a synthetic resume — not real data" + "Upload yours →" CTA. Fixture is hand-crafted; `npm run sample:regen` (`scripts/generate-sample.mjs`) regenerates from a real prod resume. |
| 13 | All M2 + M3 + M4 tests still pass (no regressions) | ✅ AUTO | `npm test` — **178 tests, 178 pass** (28 new bullet-metrics + 150 prior M2/M3/M4 tests). |
| 14 | Graph emits `node_started`/`node_completed` for `analyze_bullets` and `synthesize_summary` | ✅ AUTO + ⏳ RUNTIME | Both registered in `lib/agents/index.ts` after `compute_perception_disagreement`. `lib/graph/runtime.ts:36,73` emits the events for every node. RUNTIME visible in `/api/stream/[runId]` SSE during a real upload. |
| 15 | Delete-my-data: after pressing "Delete," user's `auth.users` row, `candidates`, `resumes`, dependent rows, and storage objects are all gone | ⏳ RUNTIME | `app/api/account/delete/route.ts` runs 4 steps in order: (1) list + remove storage under `<user_id>/`, (2) delete from `resumes` (FK cascade hits `parse_results`, `parse_disagreement`, `perception_reports`, `perception_query_responses`, `llm_responses`), (3) delete from `candidates`, (4) delete from `auth.users` via admin API. Returns per-step success array; HTTP 207 on partial failure so user knows. RUNTIME: needs a real test-account cycle on prod. |

## How to run the AUTO checks locally

```bash
npx tsc --noEmit          # criterion 1 (typecheck)
npx next build            # criterion 1 (build)
npm test                  # criteria 8, 13 — bullet-metrics + regression
```

Latest local run, all green:

```
tests 178
pass  178
fail  0
duration_ms ~742
```

## Migration runbook

```bash
# Fresh project:
supabase db push            # applies 0001 → 0002 → 0003 → 0004 → 0005 → 0006

# Existing project (already had 0001..0005):
# 0006 is idempotent — adds 2 nullable columns to perception_reports.
supabase db push
# OR via SQL editor: paste infra/supabase/migrations/0006_summary_and_bullets.sql
```

## What changed in code

### New files
- `lib/parsers/bullet-metrics.ts` — quantification / action-verb / buzzword / char-stats heuristics. ~80 ACTION_VERBS, ~45 BUZZWORDS, 6 quantification regex patterns. All exported; lists are auditable.
- `lib/parsers/__tests__/bullet-metrics.test.ts` — 28 unit tests.
- `lib/agents/analyze-bullets.ts` — graph node; picks highest-`parse_score` parser, computes per-experience metrics + aggregates.
- `lib/agents/consensus.ts` — extracted `consensusList` + `consensusText` from inline in the report page; consumed by both the report page and `synthesize-summary.ts`.
- `lib/agents/synthesize-summary.ts` — single Claude synthesis call. Builds a structured prompt from APEDS features + bullet analysis + consensus, parses the JSON response, validates, caches at `apeds_summary:v1`. Fail-soft.
- `app/reports/page.tsx` — list of past uploads.
- `app/account/page.tsx` — server component; reads user info + report count.
- `app/api/account/delete/route.ts` — destructive endpoint with per-step success reporting.
- `app/sample/page.tsx` — public synthetic-resume sample report.
- `components/report/plain-summary.tsx` — 4 sectioned cards (sage / marigold / clay / thistle) for the narrative summary.
- `components/report/report-row.tsx` — compact list row for `/reports`.
- `components/account/account-actions.tsx` — sign-out + delete-my-data UI with email-typed confirmation.
- `lib/sample/sample-report.json` — hand-crafted fixture (M5 placeholder; regenerate via `npm run sample:regen` from real prod data).
- `scripts/generate-sample.mjs` — pipeline-data → fixture script.
- `infra/supabase/migrations/0006_summary_and_bullets.sql`.

### Modified files
- `app/report/[resumeId]/page.tsx` — replaced inline `consensusList`/`consensusText` with imports from `lib/agents/consensus.ts`. Added `<PlainSummarySection>` between consensus blocks and caveat. Selects `plain_summary` from `perception_reports`.
- `lib/agents/index.ts` — added `analyze_bullets` and `synthesize_summary` graph nodes; extended `save_results.optional_deps`.
- `lib/agents/save-results.ts` — extended `perception_reports` upsert with `plain_summary` and `bullet_analysis` columns.
- `proxy.ts` — `PROTECTED_PREFIXES` extended with `/reports` and `/account`.
- `components/landing/nav.tsx` — auth-aware nav: shows different links + CTA depending on signed-in state.
- `components/landing/hero.tsx` — re-enabled "View sample" secondary CTA (was hidden in M4 per the AD entry).
- `package.json` — added `sample:regen` script + `bullet-metrics.test.ts` to the test list.

## Things deliberately NOT in M5

Per §"Things deliberately NOT in M5" of the plan:
- Outcome capture (applied / responded / interviewed / offered) — M6.
- OCR for scanned PDFs — separate effort. User flagged during M4 deploy; should land in M5b or M6.
- Custom SMTP via Resend — operational follow-up from DEPLOY.md.
- Sentry / PostHog instrumentation — operational follow-up.
- Per-LLM cohort histograms — needs many uploads, M6+.
- Real legal copy for /privacy and /terms.
- In-app resume editing.

## Open caveats / follow-ups

- **Sample fixture is hand-crafted, not pipeline-generated.** `lib/sample/sample-report.json` shipped with placeholder data. Once prod has a synthetic-resume upload, run `npm run sample:regen SAMPLE_RESUME_ID=<uuid>` and commit the result. Update `_meta.source` field accordingly.
- **synthesize_summary adds latency.** One Claude call (~3-5s) on top of the existing ~30-60s pipeline. If Vercel hobby-plan's 60s function timeout becomes a problem, either (a) bump `next.config.ts` `maxDuration` (Pro plan: up to 300s), or (b) move synthesize_summary to a separate background trigger after save_results completes.
- **Buzzword detection is judgment-call.** The 45-phrase list at the top of `bullet-metrics.ts` will be wrong sometimes. Treated as soft signal; the LLM summary is told the count but not asked to act on it directly.
- **Reports list has no pagination.** A heavy user with 100 reports will fetch all rows. Acceptable for soft launch (most users have 1-3); add pagination + filtering when a real user hits the wall.
- **Delete-my-data isn't tested with a real account on prod yet.** Cascade order is correct in code but only verified via local typecheck. Plan to test on a throwaway account (sign up, upload, delete, verify all rows gone) before announcing the feature publicly.
- **Cache version for synthesize_summary**: bumping the prompt template requires bumping `apeds_summary:v1` → `v2` in `synthesize-summary.ts:summaryCacheKey`. No automatic enforcement (M3's lockfile only covers the perceive.ts prompt suite).
- **Sample fixture goes stale on schema changes.** Any change to `ApedsRawFeatures` shape or report-component props breaks the sample render. Mitigate by re-running `sample:regen` whenever the related code changes.

## Production deployment checklist

Before pushing M5 to prod:

1. **Apply migration 0006** via Supabase SQL editor (paste `infra/supabase/migrations/0006_summary_and_bullets.sql`, run, confirm "Success").
2. **Push to main** — Vercel auto-deploys (~3 min).
3. **Smoke test** end-to-end:
   - Visit `/sample` (public) → renders without auth, shows banner.
   - Log in via existing test account (`fullofmagic4731@gmail.com` / `tyrtest123`).
   - Visit `/reports` → existing M4 upload appears.
   - Click into the existing report → `<PlainSummarySection>` shows fallback ("Summary unavailable") because that resume was processed before M5 — synthesize_summary never ran for it.
   - Re-upload a fresh resume → confirm new `plain_summary` and `bullet_analysis` columns populated.
   - Visit `/account` → email + count visible.
4. **Spot-check** the `plain_summary` JSON in the prod DB — assert it references concrete bullet numbers (criterion 11).
5. **Optional**: regenerate `lib/sample/sample-report.json` from the new prod upload via `npm run sample:regen`.
