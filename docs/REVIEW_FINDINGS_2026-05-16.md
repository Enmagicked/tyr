# Review findings — 2026-05-16

Three parallel subagent reviews of the production codebase (architecture, security, Stripe flow). This doc tracks the critical + high-severity findings and their fix status.

Legend: 🟢 fixed · 🟡 in progress · ⬜ queued · ⏸ deferred

---

## CRITICAL

### C1. Stripe webhook is not idempotent 🟡
**File:** `app/api/stripe/webhook/route.ts:40`
**Risk:** Stripe retries `checkout.session.completed` on any non-2xx response or network blip. The handler reads-then-writes `credits_remaining + creditCount` non-atomically and has no `event.id` dedupe. A duplicate delivery double-credits the user. The code comment claiming "Stripe's idempotency key prevents double-processing" is wrong — Stripe idempotency keys cover *outbound* calls, not inbound webhook deliveries.
**Fix:** Migration `0011` adds `processed_stripe_events(event_id PK)` + `apply_credit_purchase()` RPC. Webhook inserts the event_id first; on conflict bails 200 (already processed); otherwise calls the RPC for an atomic increment.

---

## HIGH

### H1. No rate limiting on expensive endpoints ⬜
**Files:** `/api/analyze`, `/api/builder`, `/api/builder/rewrite-bullet`, `/api/builder/prefill`, `/api/upload`, `/api/stripe/checkout`
**Risk:** Authed user can re-trigger 32-LLM analysis on their own resumeId indefinitely. `/api/stripe/checkout` is uncapped — DOS risk on Stripe API quota.
**Fix:** Upstash ratelimit (already in stack). Per-user budgets: analyze 10/min, builder 5/min, checkout 10/hour. ~5 lines per route via `@upstash/ratelimit`.

### H2. SSRF DNS-rebinding gap ⬜
**File:** `lib/ingest/url.ts:115-145, 152`
**Risk:** `ensurePublicHost()` resolves the host once, then `fetch()` re-resolves during the actual request — malicious DNS can return a public IP first, then `169.254.169.254`. Also `redirect: 'follow'` lets a 302 to a private IP slip the guard.
**Fix:** Pre-resolve to an IP and pin via undici `Agent` with `connect: { lookup }` returning the cached IP. Set `redirect: 'manual'` and follow hops manually with re-validation at each step.

### H3. Builder generation prompt injection ⬜
**File:** `lib/builder/prompts.ts:71-73`
**Risk:** User-controlled input fields are interpolated via `JSON.stringify(input)` with no `<user_input>` delimiter or instructions-vs-data framing. Perception path has both; builder doesn't.
**Fix:** Wrap input in `<user_input>...</user_input>`. Add an injection-defense sentence to `BUILDER_SYSTEM_PROMPT` mirroring `lib/llm/prompts.ts:67-91`. Bump `builder:v1` namespace + regen `lib/builder/prompts.lock.json`.

### H4. Service-role usage in RSC pages ⬜
**Files:** `app/report/[resumeId]/page.tsx`, `app/reports/page.tsx`, `app/account/page.tsx`, `app/builder/[resumeId]/page.tsx`, `app/api/perceive/route.ts`
**Risk:** CLAUDE.md says service-role is "trusted paths only" but it's imported in 14 places. Most filter by `candidate_id = user.id`, but the pattern is fragile — one missing filter = cross-tenant read.
**Fix:** Audit each call site, document explicit ownership filter inline, or migrate read-only RSC pages to anon-key + RLS.

---

## MEDIUM

### M1. Credit decrement races 🟡
**Files:** `app/api/upload/route.ts:216-224`, `app/api/builder/route.ts:187-195`
**Risk:** Concurrent uploads with `credits_remaining=1` both pass the gate, both insert, both decrement non-atomically. User gets 2 analyses for 1 credit.
**Fix:** `consume_credit()` RPC in migration 0011. Reserve the credit BEFORE doing work; refund on failure via `refund_credit()`.

### M2. Builder rewrite cap race 🟡
**File:** `app/api/builder/rewrite-bullet/route.ts:66-122`
**Risk:** Two concurrent rewrites both read N, both write N+1. User gets 2 rewrites for the count of 1.
**Fix:** `consume_builder_rewrite()` RPC with `WHERE builder_rewrites_used < cap`.

### M3. `0002_baseline.sql` is a 0-byte file ⬜
**File:** `infra/supabase/migrations/0002_baseline.sql`
**Risk:** Real migration at that ordinal is `0002_parse_disagreement.sql`. A fresh migration run applies the empty file (no-op). If it ever gets populated, it'll re-run silently against a populated DB.
**Fix:** Delete the empty file or stub `-- intentionally empty, see 0002_parse_disagreement.sql`.

### M4. `success_url` not pinned to canonical domain 🟡
**File:** `app/api/stripe/checkout/route.ts:26`
**Risk:** Uses `new URL(request.url).origin` — a Vercel preview URL redirects users back to the preview, not `usetyr.com`.
**Fix:** Read from `process.env.NEXT_PUBLIC_SITE_URL` with `usetyr.com` fallback. Also accept a `return_to` query param so users buying from `/account` or `/builder` land back where they came from.

### M5. Webhook-failure reconciliation ⬜
**Risk:** If Stripe webhook never arrives (network/Vercel outage), user paid and got nothing. No recovery script. `candidates.stripe_customer_id` column exists but is never written.
**Fix:** Defer to a daily reconciliation cron pulling unfulfilled checkout sessions; not pre-launch critical.

### M6. SSE stream has no auth check ⬜
**File:** `app/api/stream/[runId]/route.ts:6-42`
**Risk:** Anyone with a `runId` (UUID v4) can subscribe to another user's analysis stream. Unguessable in practice but defense-in-depth absent.
**Fix:** Re-verify session and check the `run_id → user_id` mapping (would need to track runId ownership at /api/analyze time).

### M7. `/api/account/delete` no confirmation token ⏸
**File:** `app/api/account/delete/route.ts:27`
**Risk:** Single authed POST destroys all user data. SameSite-Lax cookies are the only CSRF defense.
**Fix:** Type-email-to-confirm is already on the client UI. Server-side confirmation token would be defense-in-depth; deferred.

---

## LOW (deferred)

- `extractBuilderInputFromText` cache key missing model slug — manual ceremony on model swap.
- `parse_llm` "success with empty canonical_data" pollutes disagreement scoring.
- `broker.getHistory` returns live array reference (mutation hazard).
- `rewriteBullet` has no AbortController timeout.
- `save_results` silently no-ops on missing env vars.
- `repairAndParseJson` heavy import chain.

---

## Out of scope today

- Llama silent failures (KNOWN_ISSUES 2.2) — separate diagnostic.
- 32-parallel-LLM concurrency cap — investigate after Llama fix.
- Prompt-lock coverage gap on `lib/builder/extract.ts` — same model-swap ceremony as M1.
