# Milestone 7 — Acceptance verification

Per the M7 charter at `C:\Users\noura\.claude\plans\great-i-have-known-stateless-unicorn.md`.

**M7 goal recap:** fix the two biggest "the report looks broken" failure modes (bullet extraction returning 0, Affinda silent zero) and give locked-out users a way back in. Three independent items, single milestone.

## Acceptance criteria

| # | KNOWN_ISSUES item | Status | Evidence |
|---|---|---|---|
| 1 | 2.1 — Bullet-extraction fallback | ✅ AUTO / ⏳ RUNTIME | `pickSourceParser()` in [lib/agents/analyze-bullets.ts](lib/agents/analyze-bullets.ts) now ranks parsers by `parse_score` desc and **returns the first one with at least one extracted bullet** (degenerate fallback to highest-scored if all are empty). 8 new unit tests in [lib/agents/__tests__/analyze-bullets.test.ts](lib/agents/__tests__/analyze-bullets.test.ts) cover empty input, single result, top-with-bullets, top-without-bullets-but-second-with, all-empty fallback, alphabetical tiebreak, and multi-experience aggregation. RUNTIME: needs the same M5 PDF that previously produced `total_bullets = 0` re-uploaded to confirm the fallback now picks naive (or whichever runs second) and produces real `experience_paragraph` text. |
| 2 | 2.3 — Password reset flow | ✅ AUTO / ⏳ RUNTIME | New page `app/(auth)/forgot-password/page.tsx` (public — not in `proxy.ts` `PROTECTED_PREFIXES`) calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/auth/callback?next=/account/update-password })`. The existing `/auth/callback` exchanges the recovery code for a session and redirects. New page `app/account/update-password/page.tsx` (auth-gated via the `/account` prefix) calls `supabase.auth.updateUser({ password })`. "Forgot password?" link added to [app/(auth)/login/page.tsx](app/(auth)/login/page.tsx). PostHog events: `password_reset_requested`, `password_updated`. Build registers `○ /forgot-password` and `○ /account/update-password`. RUNTIME: needs a real reset cycle on prod (request from `/forgot-password` → recovery email → click link → set new password → confirm sign-in works). Note: emails go through Supabase default SMTP since Resend (1.2) is deferred — fine for individual recoveries (Supabase rate-limits at ~3-4/hr), insufficient for high signup volume. |
| 3 | 2.2 — Affinda silent 0.0 score | ✅ RESOLVED via drop | Diagnosed: `scoreAndIssues()` in [lib/parsers/affinda.ts](lib/parsers/affinda.ts) reaches `0.0` only when ALL six fields (name/email/phone/skills/experience/education) come back empty from `mapAffindaData()`. That points to the v3 response shape no longer matching the `AffindaDocument` interface (likely the trial-tier workspace returns a different document type, or fields moved between top-level / `meta` / `data` nesting since the integration was written). Per the M7 plan's authorization, dropped from the runtime rotation: removed from `buildAnalysisGraph()` in [lib/agents/index.ts](lib/agents/index.ts) and from `parse_resume`'s `optional_deps`. The 2-parser disagreement scorer still satisfies M2 acceptance criterion 5. `lib/parsers/affinda.ts` kept in-repo as a dormant integration with re-enable instructions in the graph comment (re-add the node + first add `console.log(raw)` to `parseWithAffinda` to inspect the live shape, then fix the mapping). |
| 4 | `npx tsc --noEmit` and `npx next build` clean | ✅ AUTO | Both green. Route table now includes `○ /forgot-password` and `○ /account/update-password`. |
| 5 | All M1–M6 tests still pass (no regressions) | ✅ AUTO | `npm test` — **194 tests, 194 pass** (186 prior + 8 new for `pickSourceParser`). |

## How to run the AUTO checks locally

```bash
npx tsc --noEmit
npx next build
npm test
```

Latest local run on 2026-05-10: all three green.

## Runtime smoke tests still owed

These three RUNTIME criteria need a quick prod walk-through before the M7 closure can flip to fully ✅:

1. **Bullet fallback (2.1)** — re-upload the M5 prod resume that previously produced `total_bullets = 0`; confirm the report now shows a real `experience_paragraph` (not the no-bullets fallback) and `source_parser` shows whichever parser the fallback picked (likely `naive` or `openresume`).
2. **Password reset (2.3)** — on the live site, click "Forgot password?" → enter your email → confirm the email arrives → click the reset link → set a new password → sign in with the new password. End-to-end should land you on `/account` with the new password working.
3. **Affinda dropped, no regressions (2.2)** — upload any resume; confirm the report renders with parser disagreement card showing only OpenResume + naive, no "Affinda failed" entries, and the `pct_quantified` / `inter_modal_delta` numbers all populate normally.

## What's deferred

None — all three M7 items shipped (2.2 via the planned drop-from-rotation path).

## Pre-public-launch checklist (still carrying from M6)

1. Buy a domain (~$10).
2. Wire Resend with the domain (DNS + Supabase SMTP swap).
3. Re-enable email confirmation in Supabase Authentication settings.
4. (M7 added) Smoke-test the password reset flow on prod.

## Next milestone

**M8 — Input expansion + viz** tackles 2.6 (paste-JD + image-of-JD), 2.7 (URL + image-of-resume), 2.8 (SVG charts in the report). Depends on M6's `lib/ocr.ts` for the image paths.
