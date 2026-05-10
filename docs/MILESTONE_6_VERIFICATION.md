# Milestone 6 — Acceptance verification

Per the M6 plan at `C:\Users\noura\.claude\plans\great-i-have-known-stateless-unicorn.md`.

**M6 goal recap:** make the public URL safe to share. Three sub-goals: kill funnel friction (1.1, 1.2, 1.5), fix the embarrassing summary copy (1.6, 2.5, 2.9, 3.5), and turn on observability (1.3, 1.4, 1.7, 2.4, 2.10). All items pulled from `docs/KNOWN_ISSUES.md`.

## Acceptance criteria

| # | KNOWN_ISSUES item | Status | Evidence |
|---|---|---|---|
| 1 | 1.5 — `target_company` optional end-to-end | ✅ AUTO | `components/upload/target-validation.ts` allows empty company (1-char still rejected as typo guard). `target-form.tsx` labels the field "(optional)" with matching placeholder. `app/api/upload/route.ts` only validates length when company is non-empty. `lib/llm/prompts.ts` `fit` query gained a third branch (role-only) — sentinel hash unchanged so no `apeds:v2 → v3` bump needed. 4 new test cases in `target-validation.test.ts`; all 16 tests in that file pass. |
| 2 | 1.1 — OCR fallback for scanned/image-only PDFs | ✅ AUTO / ⏳ RUNTIME | New `lib/ocr.ts` exports `ocrDocument(buffer, fileName, mimeType)` calling Affinda `/v3/documents` and returning `meta.rawText`. `lib/extract-text.ts` now chains: pdf-parse → if <50 chars → Affinda OCR → return whichever yielded text. `app/api/upload/route.ts` 422 hint updated to acknowledge OCR was attempted. RUNTIME: still needs a scanned PDF uploaded to prod to confirm the fallback path actually fires (text-native PDFs continue to use the pdf-parse path; both worked in the prod smoke test 2026-05-10). |
| 3 | 1.6 + 2.9 — Summary prompt rewritten | ✅ AUTO / ⏳ RUNTIME | `lib/agents/synthesize-summary-prompt.ts` (split out from synthesize-summary.ts so the lockfile test can hash without pulling LLM cache + Anthropic SDK). New prompt has 5 hard rules: cite numbers; banned-phrase list (no "successfully parsed", "results-driven", "structural failure", σ/ρ/δ/APEDS); inline-gloss every technical idea; every recommendation must reference a specific finding; and a no-bullets fallback that asks Claude to honestly acknowledge the parser returned 0 bullets instead of writing "0 of 0 quantified." Cache namespace bumped `apeds_summary:v1 → v2`. RUNTIME: still want 3 fresh prod uploads read end-to-end for banned-phrase compliance. |
| 4 | 3.5 — Lockfile drift check for synthesize_summary | ✅ AUTO | New `lib/agents/synthesize-summary.lock.json` (v2) + `lib/agents/__tests__/synthesize-summary.test.ts` mirror the `lib/llm/prompts.lock.json` pattern. `hashSummaryPromptTemplate()` rendered against fixed sentinel args; test asserts live hash equals lockfile hash. Editing buildPrompt without bumping both files now fails `npm test`. New test appended to the `package.json` `test` script. |
| 5 | 2.5 — Section headers stripped from canonical fields | ✅ AUTO | New `stripSectionHeader()` in `lib/parsers/normalize.ts` with a 23-entry header blocklist (case + punctuation insensitive). Applied at 3 points in `normalize()`: education school, experience employer/title, experience bullets. 5 new tests in `normalize.test.ts` (26 total in that file, all green). |
| 6 | 2.10 — `/test` route + `/api/test-perception` audited | ✅ AUTO | `proxy.ts` `PROTECTED_PREFIXES` gained `/test`. `app/api/test-perception/route.ts` now requires an authed user — anonymous POSTs return 401. Page kept (used as Sentry smoke target per DEPLOY.md §6) but no longer a public LLM-token cost vector. |
| 7 | `npx tsc --noEmit` and `npx next build` clean | ✅ AUTO | `tsc --noEmit` exits 0. `next build` succeeds; route table unchanged from M5. |
| 8 | All M1–M5 tests still pass (no regressions) | ✅ AUTO | `npm test` — **186 tests, 186 pass** (172 prior + 4 target-validation + 5 normalize + 1 synthesize-summary lockfile + 4 already-existing). |
| 9 | 1.4 — Sentry error monitoring | ✅ AUTO + ✅ RUNTIME | Wired via Next 16 `instrumentation.ts` + `instrumentation-client.ts`; `next.config.ts` wrapped with `withSentryConfig`. `NEXT_PUBLIC_SENTRY_DSN` set in Vercel Production env. RUNTIME confirmed 2026-05-10: signed-in user threw a manual error via `setTimeout(() => { throw new Error(...) }, 0)`, transmission to `ingest.us.sentry.io` succeeded with release `c67e4bb` + environment `vercel-production`, error appeared on Sentry Issues page within 30 sec. |
| 10 | 1.7 — PostHog funnel analytics | ✅ AUTO + ✅ RUNTIME | Wired via `npx @posthog/wizard@latest` (10 events) + 2 hand-added top-of-funnel events (`landing_view`, `cta_click`). Final 12 events: `landing_view`, `cta_click`, `user_signed_up`, `user_logged_in`, `resume_upload_started`, `resume_upload_completed`, `resume_upload_failed`, `analysis_started`, `analysis_completed`, `report_viewed`, `user_signed_out`, `account_deleted`. `/ingest/*` reverse proxy bypasses ad-blockers. `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` + `NEXT_PUBLIC_POSTHOG_HOST` set in Vercel env. RUNTIME confirmed 2026-05-10: full funnel walk on prod produced all expected events in PostHog Activity tab. |
| 11 | 1.2 — Custom SMTP via Resend | ⏸ DEFERRED | Blocked on owning a domain — Resend's `onboarding@resend.dev` shared sender only ships to the Resend account holder's own email, defeating multi-account signup tests. Mitigation in place: email confirmation disabled in Supabase Authentication → Settings, so signups complete instantly without an email round-trip. Re-enable email confirmation + wire Resend with a verified domain before the public soft launch. |
| 12 | 1.3 — Delete-data flow exercised on prod | ✅ RUNTIME | Throwaway account `424fe51c-a539-4634-8ac5-74ff3df4d26f` created on prod 2026-05-10 → uploaded a resume → completed `/account` delete flow → SQL verification across 8 tables (`auth.users`, `candidates`, `resumes`, `parse_results`, `parse_disagreement`, `perception_reports`, `perception_query_responses`, `llm_responses`) returned `count = 0` for every row; Storage `resumes` bucket folder for that UUID was gone. The cascade in `app/api/account/delete/route.ts` works end-to-end on prod. |
| 13 | 2.4 — Hero video re-encoded | ✅ AUTO | `ffmpeg -vf scale=-2:720 -c:v libx264 -crf 28 -preset slow -movflags +faststart -an public/hero.mp4` reduced 6.2 MB → 763 KB (88% smaller). No code change; the `<source>` in `components/landing/hero.tsx` already points at `/hero.mp4`. Faststart flag puts the moov atom at the head so streaming starts instantly. |

## How to run the AUTO checks locally

```bash
npx tsc --noEmit
npx next build
npm test
```

Latest local run on 2026-05-10: all three green.

## Ops items — final state (2026-05-10)

| Item | Status | Note |
|---|---|---|
| 1.4 Sentry | ✅ done | Errors flowing to sentry.io, release-tagged |
| 1.7 PostHog | ✅ done | 12 events, full funnel + churn signals |
| 1.3 Delete-data prod test | ✅ done | All 8 tables + storage cleaned correctly |
| 2.4 Hero video | ✅ done | 6.2 MB → 763 KB |
| 1.2 Resend SMTP | ⏸ deferred | Needs a real domain. Email confirmation disabled in Supabase as the bridge mitigation; re-enable both before public launch. |

## Pre-public-launch checklist (carry-over from M6)

These items are not blocking the soft launch (showing tyr to a small group) but **must** be done before publicly linking the URL:

1. **Buy a domain** — `tryr.com` / `usetyr.com` / etc. (~$10).
2. **Wire Resend with the domain** — verify DNS records, swap the Supabase SMTP sender from `onboarding@resend.dev` to your domain.
3. **Re-enable email confirmation** in Supabase Authentication → Settings.
4. **Password recovery flow** (KNOWN_ISSUES 2.3) — currently no "Forgot password?" link on `/login`. Slated for M7.

## Next milestone

Per the plan: **M7** (parser quality + auth recovery) tackles 2.1 / 2.2 / 2.3. **M8** (input expansion + viz) tackles 2.6 / 2.7 / 2.8 and depends on the OCR helper from M6.1.1.
