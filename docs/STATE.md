# tyr — current state

> **Read this first** if you're a new Claude session. Updated 2026-05-13 after M9 code-complete.

---

## ⚡ RESUME HERE (session handoff 2026-05-13)

**M9 code is done. Changes are on disk but NOT yet committed.**

### Uncommitted files (all M9 work — commit before pushing)
```
app/auth/callback/route.ts          — OTP expired error handling
app/(auth)/login/page.tsx           — OTP-expired banner UI
app/account/page.tsx                — credits card added
app/api/stripe/checkout/route.ts    — NEW: Stripe checkout session creator
app/api/stripe/webhook/route.ts     — NEW: webhook handler (checkout.session.completed)
app/api/upload/route.ts             — 402 quota gate + credit decrement + is_priority
app/reports/page.tsx                — history gating (free: 3 reports)
app/upload/page.tsx                 — CreditsAddedBanner import
components/account/account-actions.tsx  — AccountBuyCredits component added
components/upload/credits-added-banner.tsx  — NEW: post-checkout success banner
components/upload/upload-flow.tsx   — paywalled step + paywall modal + buyCredits()
docs/DEPLOY.md                      — Stripe setup checklist added to §0
docs/STATE.md                       — this file
infra/supabase/migrations/0009_credits.sql  — NEW: credits_remaining, credits_purchased, stripe_customer_id, is_priority
lib/stripe.ts                       — NEW: Stripe singleton + CREDIT_PACKS definition
```

### What the user still needs to do before M9 goes live
1. `git add -A && git commit` — commit the M9 code
2. **Supabase dashboard**: Site URL = `https://usetyr.com`, Redirect URLs include `https://usetyr.com/**` and `https://usetyr.com/auth/callback`
3. **Resend dashboard**: confirm `usetyr.com` shows Verified (green DKIM+SPF); SMTP sender = `noreply@usetyr.com` in Supabase Auth → SMTP Settings
4. **Re-enable email confirmations** in Supabase Auth Settings once steps 2–3 verified
5. **Stripe Dashboard**: Products → create "Tyr Report" → two one-time prices ($4 / $15) → note Price IDs
6. **Stripe Dashboard**: Webhooks → add endpoint `https://usetyr.com/api/stripe/webhook` → event `checkout.session.completed` → note signing secret
7. **Vercel env vars**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_1_CREDIT`, `STRIPE_PRICE_5_CREDITS`
8. **Apply `0009_credits.sql`** to prod Supabase (SQL editor)
9. **Deploy**: push to main → Vercel auto-deploys

### M10 is next (after M9 live)
- Fix Llama silent (KNOWN_ISSUES 2.2): trigger one prod upload, pull Vercel logs for `[perceive] FAILED llama-3.3-70b`, fix `callLlama()` in `lib/llm/perceive.ts`
- Integrate user's few-shot calibration examples → bump `apeds:v4 → v5`, regen lock
- Legal pages: `app/privacy/page.tsx`, `app/terms/page.tsx`, update footer links from `#`
- Hero video compression: `ffmpeg -i public/hero.mp4 -vf scale=-2:720 -crf 28 public/hero-720.mp4`

---

> Truth lives in code + commits; this doc summarizes intent, decisions, and what's broken.

## Live deployment

- **Primary domain:** https://usetyr.com (Cloudflare-registered, DNS pointed at Vercel, SSL auto-provisioned)
- **Vercel preview URL:** https://tyr-mauve.vercel.app (still works, lower priority)
- **Repo:** github.com/Enmagicked/tyr → branch `main` auto-deploys to prod on push

## What's shipped (M1–M8)

| Milestone | Goal | Commit landmarks | Verification doc |
|---|---|---|---|
| M1–M4 | Core pipeline: 3 ATS parsers + 4 LLMs + disagreement math | pre-`d744bb1` | DEPLOY.md, MILESTONE_4_VERIFICATION.md |
| M5 | Account UX, plain-English summary, sample report | `3e0676d` | MILESTONE_5_VERIFICATION.md |
| M6 | Launch-ready: optional company, OCR fallback, summary rewrite, Sentry, PostHog, hero video, delete-data prod test | `c67e4bb`–`625832c` | MILESTONE_6_VERIFICATION.md |
| M7 | Parser quality + auth recovery: bullet fallback, Affinda dropped, password reset flow | `c365fa9` | MILESTONE_7_VERIFICATION.md |
| M8 | Input expansion + viz + prompt eng bundle: paste/image-of-JD, URL/image-of-resume, 3 SVG charts, system prompt + reasoning-first JSON + injection defense + length cap + structured-output mode | `e144d70`–`5b446a3` | MILESTONE_8_VERIFICATION.md |

**Stats:** 235 tests, tsc + next build clean. Cache namespaces in use: `apeds:v4` (perception), `apeds_summary:v3` (summary).

## M9 — Paywall + Onboarding Fix (in progress)

| Item | Status |
|------|--------|
| Stripe pay-per-report credits (1×$4, 5×$15) | ✅ Coded — needs env vars + migration applied to prod |
| Migration `0009_credits.sql` | ✅ Written — apply to prod before deploying |
| auth/callback error handling (OTP expired) | ✅ Fixed |
| Login page OTP-expired banner | ✅ Added |
| Upload route 402 paywall gate | ✅ Added |
| Upload flow paywall modal + checkout | ✅ Added |
| Account page credits card | ✅ Added |
| Reports page history gating (free: 3 reports) | ✅ Added |
| Supabase dashboard URL config verification | ⏳ User does this |
| Resend domain verification (`noreply@usetyr.com`) | ⏳ User verifies |
| Re-enable email confirmations | ⏳ After verification |
| Stripe Dashboard: create products + price IDs | ⏳ User does this |
| Add Stripe env vars to Vercel | ⏳ User does this |

**Env vars needed before going live:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_1_CREDIT`, `STRIPE_PRICE_5_CREDITS` — see DEPLOY.md for the setup checklist.

## Post-M8 hot fixes (after the M8 close-out commit, in chronological order)

| Commit | What |
|---|---|
| `33c3639` | Signup routes to /upload when email confirmation is off (fixes "check your email" infinite-loop UI bug) |
| `e14dd9a` | Lazy-import jsdom + externalize from bundle (fixes PDF uploads crashing with `<!DOCTYPE` HTML 500s — jsdom was failing at module init for ALL upload requests, even non-URL ones) |
| `a82f8a1` | Removed CaveatCard + banned response-count meta-commentary in summary ("X of N AI judges responded — partial picture") |
| `145326e` | Surfaced silent LLM failures via console.error → Sentry; Gemini schema fix (strip `additionalProperties: false` which Google's responseSchema rejects) |
| `72eafc4` | consensusText surfaces reasoning content when richer than text_value (was missing the JD-grounded long-form answer) |
| `240058c` | Radar coerces Postgres `numeric` → string back to number (radar was rendering empty state with full data) |
| `191ebe8` | /forgot-password explains Supabase 60s cooldown UX |
| `3c4472e` | Track repeat-recovery empty-body bug under KNOWN_ISSUES 1.2 |
| `3189e8b` | Track buggy onboarding flow under KNOWN_ISSUES 1.8 |

## What's broken right now

### KNOWN_ISSUES 1.8 — Onboarding flow buggy end-to-end *(BLOCKER for public launch)*
Multiple layered failures hitting new-user signup:
- Confirmation emails inconsistent (sometimes instant, sometimes silent)
- Email links often return `{code:403, error_code:"otp_expired"}` even on fresh-from-inbox clicks
- Repeat password-recovery emails arrive empty (the 1.2 carry-over bug — possibly fixed by the domain switch but unverified)

**Workaround:** Supabase → Authentication → Settings → toggle **Enable email confirmations** OFF. Onboarding works instantly with no email verification. Re-enable when 1.8 is properly fixed.

**Likely fix:** Supabase URL Configuration drift after the usetyr.com domain cutover. See KNOWN_ISSUES 1.8 for the 6-step methodical fix path.

### KNOWN_ISSUES 2.2 carry-over — Llama silent
Of the 4 LLMs, only 3 (GPT-4o, Claude, Gemini) currently respond on prod. Llama (Together) silently fails on every query. Affinda was already dropped from the parser rotation in M7 (`c365fa9`) for similar reasons.

**Diagnostic:** the silent-failure logging from `145326e` is now live. Next prod upload will surface the actual Llama error in Vercel logs (search for `[perceive] FAILED llama-3.3-70b/...`) and Sentry. Once the error is known, fix the call shape in `lib/llm/perceive.ts` `callLlama()`. Most likely candidates: Together's `json_object` mode rejecting the new system message format, or rate-limiting on 8 parallel calls.

### KNOWN_ISSUES 1.2 — Repeat password recovery empty body
First recovery email = working link. Every subsequent recovery email to the same address = empty body. Observed with `onboarding@resend.dev` shared sender; possibly fixed by the usetyr.com domain switch but **unverified**. Tied into the 1.8 bundle.

## What's queued

### M9 — Few-shot calibration + self-consistency
- **2-3 calibrated example resumes per scalar query** (seniority, technical_depth, final_round_probability, ai_authored). Spec for the user to fill: [docs/M9_FEW_SHOT_INPUTS.md](M9_FEW_SHOT_INPUTS.md). User explicitly accepted ~2 hours of curation; expects to do it manually with anonymized real resumes from their network.
- **Self-consistency N=3 sampling** — 3 calls per (model, query) tuple, take median scalar / longest reasoning. Triples LLM cost (~$0.40/upload vs current ~$0.13). User opted in pre-launch since user count is low.
- Cache will bump `apeds:v4 → v5`.

### M10 — Tyr-Auth (real AI detection)
- Replace the heuristic `ai_authored` query with statistical AI detection via either OpenAI logprobs (perplexity + burstiness) or external service like GPTZero (~$0.01/req).
- Significant scope; deferred to its own milestone.

### Backlog / tier-3 items in KNOWN_ISSUES.md
3.1 outcome capture, 3.2 cohort histograms, 3.3 reports pagination, 3.4 legal copy. All gated on usage data or non-engineering work.

## Migrations applied to prod (in order)

```
0001_baseline.sql                    — candidates, resumes, parse_results, llm_responses, perception_reports + RLS + auth trigger
0002_parse_disagreement.sql          — canonical_data + parse_disagreement table
0002_baseline.sql                    — UNTRACKED in git (drift; needs review — flagged in CLAUDE.md)
0003_apeds_features.sql              — apeds_features + perception_query_responses
0004_target_metadata.sql             — resumes.target_role + target_company columns
0005_fix_handle_new_user.sql         — auth trigger fix
0006_summary_and_bullets.sql         — perception_reports.plain_summary + bullet_analysis
0007_target_jd.sql                   — resumes.target_jd column (M8.B, applied 2026-05-10)
0008_input_kind.sql                  — resumes.input_kind column with CHECK ('pdf','url','image') (M8.C, applied 2026-05-10)
```

## Pre-public-launch checklist

- [x] Buy domain (usetyr.com — done 2026-05-10)
- [x] Wire Resend with verified domain (done — but see 1.8 for residual bugs)
- [ ] Resolve KNOWN_ISSUES 1.8 (onboarding flow)
- [ ] Confirm KNOWN_ISSUES 1.2 repeat-recovery bug is fixed by domain switch (or escalate to Supabase support)
- [ ] Smoke-test password reset end-to-end on usetyr.com
- [ ] Re-enable email confirmation in Supabase once 1.8 is fixed
- [ ] Get Llama responding (KNOWN_ISSUES 2.2 carry-over) so the report shows 4-LLM disagreement instead of 3
- [ ] Real legal copy for /privacy, /terms (KNOWN_ISSUES 3.4 — non-engineering)

## Critical files (where the load-bearing logic lives)

- [lib/graph/runtime.ts](../lib/graph/runtime.ts) — DAG executor, `depends_on` (hard) + `optional_deps` (soft) semantics
- [lib/agents/index.ts](../lib/agents/index.ts) — analysis graph wiring (Affinda dropped here in M7)
- [lib/llm/prompts.ts](../lib/llm/prompts.ts) — 8 perception query prompts + system prompt (M8.A) + JD context branches (M8.B). Hashes pinned by [lib/llm/prompts.lock.json](../lib/llm/prompts.lock.json); drift test fails `npm test` if changed without bumping cache.
- [lib/llm/perceive.ts](../lib/llm/perceive.ts) — 4-provider dispatch + structured output mode + length cap + cache key. **`apeds:v4` namespace.** Bump on prompt changes.
- [lib/agents/synthesize-summary-prompt.ts](../lib/agents/synthesize-summary-prompt.ts) — plain-English summary prompt (banned-phrases list, reasoning-first schema). Hash pinned by [lib/agents/synthesize-summary.lock.json](../lib/agents/synthesize-summary.lock.json). **`apeds_summary:v3` cache namespace.**
- [lib/agents/perception-disagreement.ts](../lib/agents/perception-disagreement.ts) — σ/ρ math + APEDS feature builder
- [lib/ingest/url.ts](../lib/ingest/url.ts) — URL ingest with SSRF guard (M8.C)
- [lib/ocr.ts](../lib/ocr.ts) — Affinda-backed OCR for image-of-resume + image-of-JD (M6.1.1, reused in M8.B/C)
- [proxy.ts](../proxy.ts) — Next 16 middleware (NOT `middleware.ts` — Next 16 breaking change). Auth-gates `/upload`, `/report`, `/reports`, `/account`, `/test`.
- [components/upload/upload-flow.tsx](../components/upload/upload-flow.tsx) — 3-mode input picker (PDF / URL / Image)
- [components/report/](../components/report/) — report layout including the 3 M8.D SVG charts (per-query-bars, perception-radar, parser-agreement-bars)

## Decisions worth knowing

- **Affinda dropped from runtime rotation** (M7, commit `c365fa9`). The integration file stays in repo as dormant code with re-enable instructions. Reason: silent `parse_score: 0.0` on every prod resume — Affinda v3 response shape no longer matches our `AffindaDocument` interface (likely trial-tier workspace returns a different document type). Two-parser disagreement still satisfies M2 acceptance criterion 5.
- **Per-model prompt variants intentionally NOT shipped.** All 4 LLMs see identical prompts. Reason: tyr's value prop is "see how the LLMs disagree." Tuning per-provider would shrink headline σ in a way that's anti-product.
- **Length cap = 20K chars** (M8.A). Truncates head 10K + tail 9.9K + marker. Cache key uses truncated text so it matches what was scored.
- **`additionalProperties: false`** is in JsonSchema for OpenAI strict mode compatibility. Gemini's responseSchema rejects this field — `geminiSafeSchema()` strips it before passing to Gemini's call (commit `145326e`).
- **CaveatCard removed** from report layout (commit `a82f8a1`). The component file still exists in repo — easy to re-mount with new copy if a different disclaimer is needed.

## Recurring gotchas

- **Postgres `numeric` columns come back from Supabase as strings.** PostgREST preserves arbitrary precision. Coerce with `Number()` + `Number.isFinite()` at the consumer. Bit us once on the perception-radar (`240058c`).
- **jsdom is heavy.** Always lazy-import inside the URL branch. Always include in `serverExternalPackages` in next.config.ts. Bit us once at the upload route (`e14dd9a`).
- **Test-runner uses `node --test --experimental-strip-types`.** New `*.test.ts` files must be appended to the explicit list in [package.json](../package.json)'s `test` script. They don't auto-discover. Strip-only mode also rejects TypeScript "parameter properties" syntax (constructor `public foo:` shorthand) — declare fields separately.
- **Cache namespace bump = lockfile regen + test reruns.** Whenever you change a prompt template, bump the cache namespace in `perceive.ts` (or `synthesize-summary.ts`) AND regenerate the corresponding `*.lock.json` hash. The drift test fails until both are updated.
- **Supabase auth has a built-in 60s rate limit per email address.** Repeat reset/confirmation requests within the cooldown silently 200 without sending. Surface this in UX (M8 follow-up `191ebe8` does this for /forgot-password).

## When in doubt

- **Code > docs.** Every prompt has a comment explaining why it's shaped that way. Every cache version bump is documented in the lockfile's `comment` field.
- **Verification docs are evidence, not plan.** They flip ⏳ to ✅ as runtime smoke-tests confirm prod behavior. The plans live separately under `docs/MILESTONE_X_PLAN.md` (and historically in `C:\Users\noura\.claude\plans\`).
- **CLAUDE.md is canonical for "how to work in this repo."** It points to AGENTS.md (Next 16 warning) and this STATE.md.
