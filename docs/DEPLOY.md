# Production deployment runbook

End-to-end deploy of tyr to Vercel + Supabase prod. Follow top-to-bottom
the first time; bookmark sections for re-deploys.

Prerequisite: M4 runtime acceptance criteria verified locally (see
[MILESTONE_4_VERIFICATION.md](MILESTONE_4_VERIFICATION.md)). Don't ship a
broken local build to prod.

---

## 0. Pre-flight (10 min)

```bash
git status                        # clean working tree
git pull origin main              # up to date
npx tsc --noEmit                  # green
npx next build                    # green
npm test                          # all green
```

If any of these fail — stop. Fix locally first.

Confirm `.env.local` has every key the app actually uses; the prod env will mirror this. Inventory:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY
TOGETHER_API_KEY
AFFINDA_API_KEY                   # optional — pipeline degrades gracefully if absent
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

---

## 1. Production Supabase project (30 min)

### 1.1 Create or pick the project

- supabase.com → New project → name `tyr-prod` → choose closest region
- Wait for the project to provision (~2 min)
- Note the project ref (the `xxxxx.supabase.co` slug)

### 1.2 Apply migrations

Order matters. Apply via SQL editor (paste full file contents) or `supabase db push`:

```
infra/supabase/migrations/0001_baseline.sql        # candidates, resumes, parse_results, llm_responses, perception_reports + RLS + auth trigger
infra/supabase/migrations/0002_parse_disagreement.sql  # canonical_data + parse_disagreement table
infra/supabase/migrations/0003_apeds_features.sql   # apeds_features + perception_query_responses
infra/supabase/migrations/0004_target_metadata.sql  # target_role + target_company columns
```

After each, verify in the Table Editor that the new tables/columns appear.

### 1.3 Verify RLS

For every table created above, Database → Tables → click table → Authentication tab → confirm:
- RLS is **enabled** (toggle on)
- The expected policies are present (the count should match `schema.sql` / migration files)

If RLS is off on any table, **do not proceed** — that's a data leak waiting to happen.

### 1.4 Storage bucket

```bash
# Update .env.local temporarily to point at the prod project, OR
# set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY inline:
SUPABASE_URL=<prod_url> SUPABASE_SERVICE_ROLE_KEY=<prod_key> npm run bootstrap
```

Then in the Supabase dashboard: Storage → `resumes` bucket → Configuration → confirm:
- **Public** is OFF
- File size limit ≥ 10 MB (matches `/api/upload` validation)

### 1.5 Auth configuration

Authentication → URL Configuration:
- **Site URL**: your prod URL (e.g. `https://tyr.app`)
- **Redirect URLs**: add `https://tyr.app/auth/callback` AND any preview URL pattern (`https://*-yourname.vercel.app/auth/callback` if you use Vercel previews)

Authentication → Providers → Email:
- Confirm "Enable email confirmations" matches your launch posture (ON for prod is safer)
- Customize email templates if you care; defaults are fine for soft launch

Without this, the `/auth/callback` flow will fail in prod with a redirect error.

---

## 2. Upstash production Redis (10 min)

### 2.1 Create database

console.upstash.com → Create Database → name `tyr-prod-cache` → region close to your Vercel region → Free tier is fine for soft launch (10,000 commands/day, plenty for 50 resumes/day at 32 LLM calls each = ~1,600 commands/day).

### 2.2 Note the REST URL + token

REST API tab → copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### 2.3 Verify

```bash
curl -X POST "$UPSTASH_REDIS_REST_URL/ping" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
# → {"result":"PONG"}
```

If you get anything else, fix here, not later.

---

## 3. Vercel deployment (30 min)

### 3.1 Connect the repo

```bash
npx vercel login
npx vercel link                   # link the local project to a Vercel project
```

Or via dashboard: vercel.com → Add New → Project → Import the GitHub repo → Framework: Next.js (auto-detected).

### 3.2 Environment variables

Vercel dashboard → your project → Settings → Environment Variables. Add every key from §0, scoped to **Production** (and optionally Preview, but not Development):

```
NEXT_PUBLIC_SUPABASE_URL              <prod-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY         <prod-anon-key>
SUPABASE_SERVICE_ROLE_KEY             <prod-service-key>     ← mark Sensitive
OPENAI_API_KEY                        sk-...                  ← mark Sensitive
ANTHROPIC_API_KEY                     sk-ant-...              ← mark Sensitive
GOOGLE_GENERATIVE_AI_API_KEY          ...                     ← mark Sensitive
TOGETHER_API_KEY                      ...                     ← mark Sensitive
AFFINDA_API_KEY                       ...                     ← mark Sensitive (optional)
UPSTASH_REDIS_REST_URL                https://...upstash.io
UPSTASH_REDIS_REST_TOKEN              ...                     ← mark Sensitive
```

Mark every secret as **Sensitive** (Vercel masks them in logs and the UI). The `NEXT_PUBLIC_*` keys are inlined into client bundles and are not sensitive by definition.

### 3.3 Build settings

Defaults are correct for Next.js 16. Confirm:
- Build command: `next build`
- Output directory: (auto)
- Install command: `npm install`
- Node version: 20.x (matches `package.json` engines if set)

### 3.4 Deploy

```bash
npx vercel --prod
```

Or push to `main` if you've set up GitHub → Vercel auto-deploys. First build takes ~3 min. Watch the build log; if anything fails, it's almost always an env-var typo.

### 3.5 Vercel Analytics

Project → Analytics → Enable. Free tier covers ~2,500 events/mo, fine for soft launch. Without this you're blind.

Optionally add PostHog (`posthog-js`) for funnel analysis — strongly recommended; instrumentation in §6.

---

## 4. Custom domain (15 min, optional but do it)

### 4.1 Buy / pick

`tyr.app`, `usetyr.com`, `tyr.so` — register via Namecheap, Cloudflare, or Vercel itself.

### 4.2 Wire to Vercel

Vercel project → Settings → Domains → Add → enter the domain → follow the DNS instructions (typically: A record `76.76.21.21` for apex, CNAME `cname.vercel-dns.com` for `www`).

DNS propagation: 5 min to a few hours. SSL provisioned automatically by Vercel.

### 4.3 Update Supabase

Auth → URL Configuration → update Site URL and add the new domain to Redirect URLs (replacing or alongside the `*.vercel.app` URL).

### 4.4 Test

```bash
curl -I https://tyr.app
# → HTTP/2 200, with valid SSL
```

---

## 5. Production smoke test (15 min)

The first real upload in prod is the moment of truth. Walk through it as a brand-new user:

1. **Open prod URL in incognito** — landing renders, video plays, all sections animate
2. **Click "Decode my resume" CTA** → redirects to `/login?next=/upload`
3. **Sign up** with a real email you control → email confirmation arrives → click confirmation link → land on `/upload`
4. **Enter target role + company** → dropzone enables
5. **Upload a real resume PDF** → spinner advances → SSE events fire (open DevTools Network tab, watch `/api/stream/[runId]`) → redirect to `/report/[id]`
6. **Verify report renders fully** with non-zero data:
   - Headline scores are real numbers (not 0/100, not null)
   - Parser disagreement card shows fields with values
   - σ/ρ grid has 8 rows with non-null σ for ≥3 of the scalar queries
   - Inter-modal δ needle is positioned somewhere on the gradient
   - Consensus blocks (top strengths, missing signal) have real text
7. **Open Supabase dashboard** → Table Editor → verify rows in:
   - `resumes` (1 row)
   - `parse_results` (2–3 rows)
   - `parse_disagreement` (1 row)
   - `perception_query_responses` (~32 rows = 4 models × 8 queries)
   - `perception_reports` (1 row, with `apeds_features` and `ai_legibility_score` populated)
8. **Open Upstash dashboard** → Data Browser → verify keys with `apeds:v2:*` namespace exist
9. **DevTools console**: zero errors, zero hydration warnings
10. **Run the same upload a second time with the same resume + same target** → confirm cache hits (faster response, fewer LLM calls in Vercel logs)

If any step fails, capture the error, fix, redeploy, retry. Don't soft-launch with a broken funnel.

---

## 6. Analytics instrumentation (30 min, do before sharing)

You need 6 events to make sense of the soft launch:

| Event | Where | Why |
|---|---|---|
| `landing_view` | landing client component, on mount | Top of funnel |
| `cta_click` | hero CTA + nav CTA | Intent signal |
| `signup_complete` | `/auth/callback` success | Conversion to account |
| `upload_start` | `/upload` form submit | Conversion to use |
| `upload_complete` | redirect to `/report/[id]` | Conversion to value |
| `report_view` | `/report/[id]` mount | Conversion to value-realized |

PostHog setup:

```bash
npm install posthog-js
```

Init in `app/layout.tsx` (client wrapper):

```tsx
'use client'
import posthog from 'posthog-js'
import { useEffect } from 'react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        capture_pageview: true,
      })
    }
  }, [])
  return <>{children}</>
}
```

Add `NEXT_PUBLIC_POSTHOG_KEY` to Vercel env. Wrap the app in the layout.

Fire events at the call sites:

```ts
posthog.capture('upload_complete', { resume_id, target_role, target_company })
```

Without this you'll have no idea why users drop off. The pricing is ~$0/mo at <1M events.

---

## 7. Re-deploy checklist

For every subsequent deploy:

```bash
git pull origin main
npm test                          # green
npx next build                    # green
git push origin main              # auto-deploys via Vercel
```

If the change includes a new migration:
1. Apply migration to prod Supabase **before** the code reaches prod (otherwise queries 500)
2. Push the code
3. Verify the smoke test still passes

If the change includes a prompt-template change in `lib/llm/prompts.ts`:
1. Bump the cache version in `prompts.lock.json` (M3 build check enforces this)
2. Old cache entries are now stale-keyed (effectively flushed)
3. First few requests post-deploy will be cache-miss-heavy; that's expected

---

## 8. Rollback

If a deploy is bad:

```bash
# Vercel: instant rollback
npx vercel rollback                  # rolls back to previous deployment
```

Or via dashboard: Deployments → previous good deploy → Promote to Production.

For DB migrations: there's no automatic rollback. If a migration broke prod, write a follow-up migration to undo it (additive only — never `DROP COLUMN` on a live table without a 2-step deprecation).

---

## 9. Health check

A live site needs at least one passive sanity probe. Cheap option:

- UptimeRobot (free) → HTTPS check on `https://tyr.app` every 5 min → email/SMS on failure
- Or Vercel's built-in monitoring → Settings → Notifications → enable production failure alerts

For richer signal once you have users: Sentry for client + server errors. Defer until soft launch tells you it's needed.

---

## Common failures and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `/auth/callback` errors with "redirect URL not allowed" | Supabase Auth URL config missing prod domain | Auth → URL Configuration → add prod URL |
| Landing renders but `/upload` 500s | `proxy.ts` env var missing or wrong | Check `NEXT_PUBLIC_SUPABASE_*` in Vercel |
| Upload succeeds but report shows nulls | Service role key missing in Vercel | Set `SUPABASE_SERVICE_ROLE_KEY`, redeploy |
| LLM calls all timeout | One model's API key wrong; check Vercel runtime logs | Replace key, redeploy |
| Storage upload fails with 403 | Bucket is public or RLS policies missing | Re-run `npm run bootstrap` against prod, verify private |
| Hydration warnings on the landing | Server/client time mismatch in a date | Wrap date logic in `useEffect` or pass server timestamp via props |
| Lighthouse LCP > 2.5s | Hero video is too large | Transcode `public/hero.mp4` to 720p H.264 + add `<source>` for AV1 |

---

## When you're done

Update [MILESTONE_4_VERIFICATION.md](MILESTONE_4_VERIFICATION.md) — flip the runtime ⏳ criteria to ✅ with prod evidence (Lighthouse score, cache hit rate, etc.).

Then proceed to [SOFT_LAUNCH.md](SOFT_LAUNCH.md).
