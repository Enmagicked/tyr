# tyr — current state

> **Read this first** if you're a new Claude session. Updated 2026-05-15 mid-launch (M9.5 live, polish iteration in flight).

---

## ⚡ RESUME HERE (session handoff 2026-05-15, M9.5 in flight)

**Launching today.** M9.5 (Activities Builder + internship preset + rebuild flow) is live on prod. The user has been iterating on polish/bugs all day. Most recent open item: prefill extraction quality — see "Open issues" below.

### What's live on prod (last commit deployed = `ea5f673`)
1. **Decoder + Builder both fully working end-to-end** with Stripe paywall
   - Free credit on signup is **analyzer-only**; builder requires a prior purchase (BUILDER_LOCKED 402 + paywall modal)
2. **Admin bypass** via `ADMIN_EMAILS` env var (set in Vercel — `fullofmagic4731@gmail.com`)
3. **Llama back in rotation** — was silent because `TOGETHER_API_KEY` was never added to Vercel; added it and now 4-of-4 LLMs respond
4. **Internship preset** toggle wired through the entire analyzer (8 perception queries + summary prompt)
5. **Rebuild flow:** report page → big "Rebuild" CTA card → `/builder?from=<resumeId>` → client-side Claude Haiku extraction prefills the form (contact / education / experiences / projects / activities / skills / awards) + banner shows the analyzer's gap to avoid + strengths to lean into
6. **LLM as third parser** (`parse_llm` node, alongside openresume + naive) — fixes "0 of 0 bullets quantified" on awkward resumes and gives the disagreement scorer a high-quality anchor
7. **Naive education extraction** — uses `seed-schools.json` aliases, kills the "Education 0% agreement" misleading chart row
8. **OCR via Claude Vision** for image uploads (Affinda was unreliable trial-tier); Affinda kept for PDF OCR fallback only
9. **`/privacy` + `/terms`** pages live, footer links wired
10. **Legal + nav:** Decoder + Builder both in main nav (anon + authed). Hero CTA + upload page CTA point users to `/builder` when they don't have a resume yet.
11. **`/reports`** now lists builder drafts with a marigold "Builder" badge; rows route to `/builder/<id>` (editable preview) instead of `/report/<id>`
12. **Rewrite cap (5/draft) error** now surfaces in a dismissible banner with the buttons disappearing past the cap (was silently failing)
13. **Postgres null-byte fix** (`22P05`) — strip `\0` from raw_text/target_role/target_company/target_jd at the API boundary
14. **Role field** clearly accepts freeform input (was looking like a closed dropdown)
15. **Favicon** swapped in (`app/favicon.ico`)

### Open issues / known weak points as of last commit
- **Prefill extraction is currently using Haiku** (`claude-haiku-4-5-20251001`). Per user preference for speed-over-completeness AFTER Sonnet repeatedly hit the 25s abort timeout on cold starts.
  - Haiku may extract only partial data on some resumes (user previously saw "only skills" — meaning skills came back from the **canonical fallback** because Haiku returned null, not because Haiku only emitted skills)
  - If Haiku returns null, we fall through to `canonicalToBuilderInput(canonical)` which uses naive's KNOWN_SKILLS keyword match — that's why an empty-extraction prefill still shows a few skills + a `• • • •` name (naive's first-line heuristic hitting bullet chars)
  - Cache namespace currently `builder_extract:v3` (post Sonnet → Haiku revert)
  - Prefill route `/api/builder/prefill` has `maxDuration = 60`; internal Haiku call has `AbortController` timeout at **50s** (was 25, bumped after Sonnet abort issue)
- Big loading UI now warns users prefill can take ~1 minute on cold start — visible spinner, two-step progress dots, "please don't refresh" copy

### Critical commits in this session (since `M9.5 d92683b`)
- `81afc55` — discoverability (Decoder/Builder nav, hero + upload CTAs, builder page rewrite-loop pitch) + OCR Claude Vision
- `d9f8dcb` — `ADMIN_EMAILS` bypass on `/api/upload`, `/api/builder`, `/api/builder/rewrite-bullet`
- `ae8a361` — favicon + `/privacy` + `/terms` + rewrite-limit UI
- `0d16093` — `[graph] node_failed` console.error (surfaced Llama silent failure → revealed missing `TOGETHER_API_KEY`)
- `064cb94` — strip `\0` NUL bytes from text fields (`22P05` fix)
- `5a45eb7` — role field "or type your own" UX hint
- `969a052` — naive education extraction (seed-schools alias scan) + rebuild flow CTA
- `a42fe87` — Claude Haiku BuilderInput extractor (initial; switched to Sonnet, then back to Haiku later)
- `e3e1b20` — `parse_llm` graph node + chart label "3 parsers"
- `9e75a29`, `bc80f76`, `defdbf0` — debug-friendly error surfacing in upload + builder
- `2a6cb9a` — async client-side prefill via new `/api/builder/prefill` endpoint + `/reports` builder-row routing + `maxDuration=60` on `/api/builder`
- `4b8a1b0` — prefill loading spinner banner
- `7c2dc59` — Decoder nav link
- `359544f` — Haiku dated slug `claude-haiku-4-5-20251001` (bare alias 404s)
- `7eec932` — Sonnet swap for extraction reliability (later reverted)
- `73c4321` — abort bump 25s → 50s for extraction
- `ea5f673` — **CURRENT** — back to Haiku + prominent loading UI w/ "~1 minute" warning

### Critical file paths (post-launch additions)
- `lib/builder/extract.ts` — Haiku-based BuilderInput extractor with cache namespace `builder_extract:v3`, 50s AbortController. **Bumps namespace when model changes.**
- `lib/builder/source-context.ts` — `loadBuilderSourceContext(resumeId, candidateId, { withExtraction })`. `withExtraction:false` for `/api/builder` POST (cheap), `withExtraction:true` for prefill (Haiku call)
- `app/api/builder/prefill/route.ts` — GET endpoint, `maxDuration=60`, returns `BuilderSourceContext` with `prefilled_input`
- `lib/agents/parse-llm.ts` — third parser node, returns `ParseResult` with `parser_name: 'llm'`, coverage-based `parse_score` (cap 0.95)
- `lib/admin.ts` — `isAdminEmail()` via `ADMIN_EMAILS` env var (comma-separated, case-insensitive)

### What to know about the architecture (post-M9.5)
- **3 parsers now:** openresume + naive + llm. Aggregator picks first-with-bullets for `analyze_bullets.source_parser` → typically LLM wins on awkward resumes
- **Cache namespaces in play:** `apeds:v5` (perception), `apeds_summary:v4` (summary), `builder:v1` (resume generation), `builder_rewrite:v1` (bullet rewrites), `builder_extract:v3` (prefill extraction)
- **Insights-conditioned generation:** `/api/builder` POST loads `missing_signal` + `top_strengths` consensus from source resume (no Haiku call) and appends to the prompt at call time. Not part of `lib/builder/prompts.lock.json` — it's a runtime addendum so the lockfile invariant stays intact
- **Migration 0010** applied to prod: extends `input_kind` CHECK to include `'builder'`, adds `is_internship` + `builder_input` jsonb + `builder_rewrites_used` int

### Next session: user wants to focus on UI polish
M9.5 functionality is done and working end-to-end. The user's stated next focus is **UI / visual polish** — not new features, not bugs (unless one surfaces). Treat next session as a design pass: typography, spacing, copy, layout consistency, animation, mobile responsiveness, the report page's data density, the builder preview's print fidelity, etc. Wait for the user to point at specific surfaces rather than refactoring proactively.

### What to investigate next session (if user reports prefill still empty)
1. Check Vercel logs for `[builder.extract]` lines — they explicitly say which stage failed (empty response / parse / validate / abort)
2. If Haiku consistently returns shallow JSON, options are:
   - Stream the response so it can use full max_tokens without timing out
   - Two-pass extraction (Haiku for short sections, Sonnet for long descriptions)
   - Pre-cache extraction at upload time (background job, no user-facing latency)
3. Sonnet was reverted because of cold-start aborts. If we want to try again, increase route `maxDuration` past 60s (requires Vercel Pro / Enterprise) or split into multiple smaller calls

---

## ⚡ PRIOR HANDOFF (2026-05-13, post-M9)

**M9 is LIVE on prod.** Paywall works end-to-end: free 1 credit on signup → 402 modal on exhaustion → Stripe Checkout → webhook adds credits → next upload succeeds. Smoke-tested with a real $6 charge.

### Final M9 commits
- `d47c0f9` — feat(m9): paywall + onboarding fix (main body)
- `e62ecb1` — fix(m9): bump 1-credit pack price $4 → $6 to match live Stripe
- `cdc0f7d` — fix(stripe): explicit payment_method_types=['card'] (Stripe Checkout rejected sessions without it on a fresh-activated account)

### Prod state as of 2026-05-13
- Migration `0009_credits.sql` applied to prod Supabase ✅
- Stripe live mode: product "Tyr Report" with 2 prices ($6 / $15) ✅
- Stripe webhook → `https://usetyr.com/api/stripe/webhook` for `checkout.session.completed` ✅
- Vercel env vars set: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_1_CREDIT`, `STRIPE_PRICE_5_CREDITS` ✅
- Supabase URL config: Site URL = `https://usetyr.com`, redirect URLs include `/auth/callback` ✅
- Resend domain `usetyr.com` verified, SMTP sender `noreply@usetyr.com` ✅
- Email confirmations re-enabled in Supabase Auth Settings ✅

### Post-M9 follow-ups (housekeeping)
- Refund the $6 smoke-test charge in Stripe Dashboard → Payments
- Confirm webhook delivered `200` in Stripe Dashboard → Webhooks → Recent deliveries
- Optional: activate Card payment method in Stripe dashboard (not required since `payment_method_types=['card']` is now explicit, but useful if you ever want Apple Pay/Link/etc.)

### M9.5 — Activities Builder + Internship preset (code-complete 2026-05-13)

Plan: [.claude/plans/whimsical-gliding-tide.md](../../.claude/plans/whimsical-gliding-tide.md). Spec memory: [memory/project_m9_5_spec.md](../../.claude/projects/C--Users-noura-projects-ai-hiring-decoder/memory/project_m9_5_spec.md).

**Shipped (code on disk, awaiting prod smoke test):**
- Migration `0010_builder_and_internship.sql` — applied to prod 2026-05-13.
  Extends `resumes.input_kind` to include `'builder'`, adds `is_internship`, `builder_input` jsonb, `builder_rewrites_used` int.
- **Internship preset** wired through analyzer:
  - `lib/llm/prompts.ts` — `internshipPreamble()` prepended to all 8 perception queries when `ctx.is_internship=true`
  - `lib/agents/synthesize-summary-prompt.ts` — same preamble for the plain-summary prompt
  - Cache namespace bumps: `apeds:v4 → v5`, `apeds_summary:v3 → v4`
  - Both lockfiles regenerated (`lib/llm/prompts.lock.json` → v5, `lib/agents/synthesize-summary.lock.json` → v4)
  - UI: `is_internship` checkbox in `components/upload/target-form.tsx`
  - Plumbed through `app/api/upload/route.ts` → `resumes.is_internship` → `lib/agents/load-resume.ts` → `lib/agents/llm.ts` → perception context
- **Activities Builder** at `/builder`:
  - `lib/builder/{types,prompts,generate,rewrite,render}.ts` — structured input → Claude generation → JSON resume → markdown render for the perception graph
  - `app/api/builder/route.ts` — credit-gated endpoint (requires `credits_remaining ≥ 1 AND credits_purchased ≥ 1`; signup-bonus credit is analyzer-only)
  - `app/api/builder/rewrite-bullet/route.ts` — targeted bullet rewrites, capped at 5 per draft
  - `app/builder/page.tsx` + `app/builder/[resumeId]/page.tsx` — form + scored preview
  - `components/builder/{builder-form,builder-flow,builder-preview,print-styles.css}.tsx`
  - Print export = `window.print()` against `@media print` stylesheet (no new deps)
  - Reuses Stripe checkout flow for paywall ("buy credits to unlock the builder" variant copy)
- Prompt-lock drift test added at `lib/builder/__tests__/prompts.test.ts` — 241/241 tests pass, `next build` clean.

**Unique value:** the builder doesn't just generate a resume — it immediately runs the generated text through the same 4-LLM perception graph the analyzer uses, then lets the user surgically rewrite individual bullets within their 1-credit session (cap = 5 rewrites). Tyr-specific differentiator: no other resume builder shows live recruiter-AI scoring as you iterate.

**Smoke-test checklist (run after push to main):**
- Sign up fresh / use a 0-credit account → visit `/builder` → submit → expect `402 BUILDER_LOCKED` paywall.
- Buy a credit pack via the paywall modal → return to `/builder` → submit form → wait for generation + scoring → land on `/builder/[resumeId]`.
- Verify the resume renders, scores show, "🔁 Rewrite" appears on hover for bullets.
- Click rewrite on one bullet → expect the bullet to update inline, rewrites counter decrements.
- Repeat 5 more times → 6th click should return `429 REWRITE_LIMIT`.
- Click "Print / save as PDF" → expect chrome-free print preview.
- On the analyzer (`/upload`): tick "Applying to an internship", upload a junior resume, verify report renders without breaking. Same resume without the checkbox should produce a noticeably different seniority/missing-signal narrative.

### After M9.5 — M10 carries over
- Fix Llama silent (KNOWN_ISSUES 2.2): trigger one prod upload, pull Vercel logs for `[perceive] FAILED llama-3.3-70b`, fix `callLlama()` in `lib/llm/perceive.ts`
- Few-shot calibration examples → bump cache namespace + regen lock
- Legal pages: `app/privacy/page.tsx`, `app/terms/page.tsx`, update footer links from `#`
- Hero video compression: `ffmpeg -i public/hero.mp4 -vf scale=-2:720 -crf 28 public/hero-720.mp4`
- Per-bullet score badges in `/builder/[resumeId]` (only show 🔁 on weak bullets, not all)
- Nav link or upload-page CTA pointing at `/builder`

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

## M9 — Paywall + Onboarding Fix (SHIPPED 2026-05-13)

Live on prod. 1 free credit on signup, $6 / $15 packs via Stripe Checkout, webhook fulfilment. Email confirmations re-enabled.

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
