# Milestone 1 — Acceptance verification

Per §7.3. Each criterion below is marked auto-verified (build/typecheck/lint
output) or runtime-verified (must run end-to-end against your Supabase project
and the configured LLM keys).

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `pnpm install && pnpm dev` runs without errors | ✅ AUTO | `npx next dev` boots in 691 ms, no errors. `npx tsc --noEmit` clean. `npx next build` clean (one pre-existing eslint warning in `(auth)/signup/page.tsx` for an unused `router`, not in M1 scope). Note: this repo uses npm; pnpm would also work since it reads `package.json`. |
| 2 | New user signs up and sees upload page | ⏳ RUNTIME | `/signup` exists and posts to Supabase Auth with `emailRedirectTo` → `/auth/callback`. Callback exchanges the code for a session and redirects to `/`. `app/page.tsx` now renders the upload component for authenticated users (gate added in Issue A). |
| 3 | PDF upload completes < 2 s | ⏳ RUNTIME | `/api/upload` extracts text (now via `new PDFParse({data}).getText()` after the v2 fix), uploads to `resumes/` bucket, inserts `resumes` row. Latency dominated by Supabase Storage upload. Run `npm run bootstrap` once first to create the bucket. |
| 4 | `/api/analyze` returns `runId` < 200 ms | ⏳ RUNTIME | Route spawns the graph as a background `Promise` tracked by `broker.track(runId, task)` and returns `{ runId }` immediately — no awaits between auth check and response. |
| 5 | EventSource receives `node_started/completed:load_resume`, `…:parse_resume`, `…:perceive_resume`, `graph_completed` | ✅ AUTO + ⏳ RUNTIME | `lib/agents/index.ts` defines nodes named exactly `load_resume`, `parse_resume`, `perceive_resume` (the aggregates). The runtime in `lib/graph/runtime.ts` emits `node_started` / `node_completed` for every node and `graph_completed` at the end. The fan-out parser/LLM nodes (`parse_affinda`, etc.) emit additional events on top. |
| 6 | Browser redirects to `/report/{resumeId}`; renders without 404 | ✅ AUTO + ⏳ RUNTIME | Page exists at `app/report/[resumeId]/page.tsx`. Build registers it as `ƒ /report/[resumeId]`. `components/resume-upload.tsx` redirects on `graph_completed` or on `EventSource.onerror` (still safe — graph runs server-side independently). |
| 7 | `parse_results` has 1–3 rows | ⏳ RUNTIME | `lib/agents/save-results.ts` inserts one row per parser in `(ctx.parse_resume as { results }).results`. Affinda failures now produce a row with `parse_score: 0` and `issues: [{ field: 'parser', issue: 'AFFINDA_API_KEY not set; parser skipped', severity: 'high' }]`. |
| 8 | `llm_responses` has rows per (model × prompt) | ⏳ RUNTIME | `save-results.ts` now also writes `llm_responses` (gathered from `ctx.perceive_gpt4o`/`perceive_claude`/`perceive_gemini`). This used to live in `/api/perceive`, which is no longer in the unified path. |
| 9 | `perception_reports` has exactly one row | ⏳ RUNTIME | `save-results.ts` upserts on `resume_id`, which is `UNIQUE` per `lib/supabase/schema.sql`. |
| 10 | Affinda failure case still completes | ✅ AUTO | `lib/parsers/affinda.ts` no longer throws — it returns a `ParseResult` with `parse_score: 0` and a populated `issues[]` for missing key, network error, non-200 HTTP, or non-JSON response. Other parsers run independently. |
| 11 | Unauthenticated `/api/upload` returns clean 401 | ✅ AUTO | `app/api/upload/route.ts` line 11: `if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`. |
| 12 | Tab close survives — report appears later | ✅ AUTO + ⏳ RUNTIME | `/api/analyze` fires the graph as `execute(...).catch(...)` and registers it via `broker.track(runId, task)`, which holds a strong ref to the promise so the GC can't collect it mid-run. The `/report/[resumeId]` page reads from Supabase, not from the live broker — so a closed tab simply means the SSE drops; the graph completes; rows are written; the page renders. |

## Manual smoke-test runbook

Once your Supabase project has the schema applied (`lib/supabase/schema.sql`)
and you've set `.env.local` with all keys, run in order:

```bash
npm install
npm run bootstrap          # create the 'resumes' Storage bucket
npm run dev
```

Then in a browser:

1. Sign up at `http://localhost:3000/signup`. Confirm via the emailed link.
2. Land at `/`, verify the upload card renders (auth gate worked).
3. Drop a PDF resume. Verify spinner advances `uploading → analyzing` and the
   per-node label cycles (e.g. `load_resume`, `parse_affinda`, `perceive_claude`,
   `parse_resume`, `perceive_resume`, `save_results`).
4. Verify redirect to `/report/{id}` and that both sections render JSON.
5. In Supabase SQL editor:
   ```sql
   select count(*) from parse_results       where resume_id = '{id}';   -- 1..3
   select count(*) from llm_responses       where resume_id = '{id}';   -- ~6..18
   select count(*) from perception_reports  where resume_id = '{id}';   -- 1
   ```

## Things deliberately NOT done in M1

Per §7.4: no new features, no parser disagreement scoring, no extra LLMs, no
landing page, no Python service, no real report UI.

## Things found during audit and fixed beyond §7.2 issue list

- **pdf-parse v2 import was broken** — `import pdfParse from 'pdf-parse'` no
  longer works in 2.4.5 (no default export). Replaced with `new PDFParse({ data })`
  pattern. This was blocking every upload and is the single most important fix
  in M1.
- **`middleware.ts` deprecated in Next.js 16** — renamed file to `proxy.ts` and
  function to `proxy()`. Per AGENTS.md ("Heed deprecation notices") and the
  bundled v16 docs. Build now reports `ƒ Proxy (Middleware)`.
- **Pre-existing `Buffer → BlobPart` typecheck error in affinda.ts** — fixed
  while rewriting the file for Issue D, by wrapping in `new Uint8Array(...)`.
- **Pre-existing unknown→ReactNode errors in `app/test/page.tsx`** — fixed
  with explicit nullish/undefined checks.
- **Multiple-lockfile warning** — added `turbopack.root: __dirname` to
  `next.config.ts` so Next.js doesn't pick up the stray `package-lock.json`
  in `~/`.

## Open caveats

- The `/api/parse` and `/api/perceive` routes still exist but are no longer
  in the unified upload path. They can be deleted in M13 if they remain
  unused (audit noted this).
- The `app/test/*` smoke test page and `/api/test-perception` route are kept
  as documented dev aids.
- The schema is still in `lib/supabase/schema.sql` rather than versioned
  migrations — §4.3 moves it to `infra/supabase/migrations/` in M2/M4.
