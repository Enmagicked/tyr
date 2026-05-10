# Milestone 6 — Acceptance verification

Per the M6 plan at `C:\Users\noura\.claude\plans\great-i-have-known-stateless-unicorn.md`.

**M6 goal recap:** make the public URL safe to share. Three sub-goals: kill funnel friction (1.1, 1.2, 1.5), fix the embarrassing summary copy (1.6, 2.5, 2.9, 3.5), and turn on observability (1.3, 1.4, 1.7, 2.4, 2.10). All items pulled from `docs/KNOWN_ISSUES.md`.

## Acceptance criteria

| # | KNOWN_ISSUES item | Status | Evidence |
|---|---|---|---|
| 1 | 1.5 — `target_company` optional end-to-end | ✅ AUTO | `components/upload/target-validation.ts` allows empty company (1-char still rejected as typo guard). `target-form.tsx` labels the field "(optional)" with matching placeholder. `app/api/upload/route.ts` only validates length when company is non-empty. `lib/llm/prompts.ts` `fit` query gained a third branch (role-only) — sentinel hash unchanged so no `apeds:v2 → v3` bump needed. 4 new test cases in `target-validation.test.ts`; all 16 tests in that file pass. |
| 2 | 1.1 — OCR fallback for scanned/image-only PDFs | ✅ AUTO / ⏳ RUNTIME | New `lib/ocr.ts` exports `ocrDocument(buffer, fileName, mimeType)` calling Affinda `/v3/documents` and returning `meta.rawText`. `lib/extract-text.ts` now chains: pdf-parse → if <50 chars → Affinda OCR → return whichever yielded text. `app/api/upload/route.ts` 422 hint updated to acknowledge OCR was attempted. RUNTIME: needs a scanned PDF uploaded to prod to confirm the fallback path actually fires (local pdf-parse path still covers text-native PDFs). |
| 3 | 1.6 + 2.9 — Summary prompt rewritten | ✅ AUTO / ⏳ RUNTIME | `lib/agents/synthesize-summary-prompt.ts` (split out from synthesize-summary.ts so the lockfile test can hash without pulling LLM cache + Anthropic SDK). New prompt has 5 hard rules: cite numbers; banned-phrase list (no "successfully parsed", "results-driven", "structural failure", σ/ρ/δ/APEDS); inline-gloss every technical idea; every recommendation must reference a specific finding; and a no-bullets fallback that asks Claude to honestly acknowledge the parser returned 0 bullets instead of writing "0 of 0 quantified." Cache namespace bumped `apeds_summary:v1 → v2`. RUNTIME: needs 3 fresh prod uploads to read for banned-phrase compliance. |
| 4 | 3.5 — Lockfile drift check for synthesize_summary | ✅ AUTO | New `lib/agents/synthesize-summary.lock.json` (v2) + `lib/agents/__tests__/synthesize-summary.test.ts` mirror the `lib/llm/prompts.lock.json` pattern. `hashSummaryPromptTemplate()` rendered against fixed sentinel args; test asserts live hash equals lockfile hash. Editing buildPrompt without bumping both files now fails `npm test`. New test appended to the `package.json` `test` script. |
| 5 | 2.5 — Section headers stripped from canonical fields | ✅ AUTO | New `stripSectionHeader()` in `lib/parsers/normalize.ts` with a 23-entry header blocklist (case + punctuation insensitive). Applied at 3 points in `normalize()`: education school, experience employer/title, experience bullets. 5 new tests in `normalize.test.ts` (26 total in that file, all green). |
| 6 | 2.10 — `/test` route + `/api/test-perception` audited | ✅ AUTO | `proxy.ts` `PROTECTED_PREFIXES` gained `/test`. `app/api/test-perception/route.ts` now requires an authed user — anonymous POSTs return 401. Page kept (used as Sentry smoke target per DEPLOY.md §6) but no longer a public LLM-token cost vector. |
| 7 | `npx tsc --noEmit` and `npx next build` clean | ✅ AUTO | `tsc --noEmit` exits 0. `next build` succeeds; route table unchanged from M5. |
| 8 | All M1–M5 tests still pass (no regressions) | ✅ AUTO | `npm test` — **186 tests, 186 pass** (172 prior + 4 target-validation + 5 normalize + 1 synthesize-summary lockfile + 4 already-existing). |
| 9 | 1.4 — Sentry error monitoring | ⏳ OPS | Action items: `npx @sentry/wizard@latest -i nextjs`, add DSN to Vercel env, deploy, smoke-test by POSTing junk to `/api/test-perception` while signed in (deliberate throw via `JSON.parse(`bogus`)`-style payload). |
| 10 | 1.7 — PostHog funnel analytics | ⏳ OPS | Action items per `docs/DEPLOY.md` §6: `npm install posthog-js`, add `PostHogProvider` to `app/layout.tsx`, add `NEXT_PUBLIC_POSTHOG_KEY` to Vercel env, fire 6 events: `landing_view`, `cta_click`, `signup_complete`, `upload_start`, `upload_complete`, `report_view`. |
| 11 | 1.2 — Custom SMTP via Resend | ⏳ OPS | Action items: Resend account → API key → Supabase Auth → SMTP Settings. Verify with a 5-account signup burst from incognito. |
| 12 | 1.3 — Delete-data flow exercised on prod | ⏳ OPS | Action items: throwaway test account → upload → `/account` delete → service-role REST query confirms 0 residual rows in `resumes`, `parse_results`, `parse_disagreement`, `perception_query_responses`, `perception_reports`, `llm_responses`, `candidates`, `auth.users` for that user; 0 storage objects under their prefix. |
| 13 | 2.4 — Hero video re-encoded | ⏳ OPS | Action item: `ffmpeg -i public/hero.mp4 -vf scale=-2:720 -crf 28 -c:v libx264 public/hero-720.mp4`, swap source in landing component, commit. Target ~1-2 MB (currently 6.4 MB). |

## How to run the AUTO checks locally

```bash
npx tsc --noEmit
npx next build
npm test
```

Latest local run on 2026-05-10: all three green.

## Ops items (criteria 9–13)

These need user action — accounts, env vars, prod smoke tests. None of them require further code from this branch:

1. **Resend SMTP** (1.2) — blocking for any signup burst >2/hr.
2. **Sentry** (1.4) — blocks visibility into prod errors.
3. **PostHog** (1.7) — blocks funnel measurement; without it the soft launch produces zero data.
4. **Delete-data prod test** (1.3) — verifies the cascade actually works on prod.
5. **Hero video re-encode** (2.4) — fixes mobile LCP.

All five are S/T effort. After they're done, flip the ⏳ entries to ✅ here with the evidence.

## Next milestone

Per the plan: M7 (parser quality + auth recovery) tackles 2.1 / 2.2 / 2.3. M8 (input expansion + viz) tackles 2.6 / 2.7 / 2.8 and depends on the OCR helper from M6.1.1.
