# Milestone 1 — Foundation audit

Snapshot of the codebase before any M1 changes. One paragraph each per §7.1.

## What works

The graph-executor scaffolding is solid. `lib/graph/runtime.ts` is a clean
DAG runner with `depends_on` (hard) and `optional_deps` (soft) semantics
and a `Promise.race` over a running map — exactly the pattern needed for
partial-result resilience. `lib/event-broker.ts` provides in-process pub/sub
with history replay so a late SSE subscriber doesn't miss earlier events,
and `broker.track()` retains a strong ref so the background graph isn't GC'd
mid-run. `app/api/analyze` correctly fires the graph as a tracked background
task and returns `{ runId }` immediately. `app/api/stream/[runId]` is a
correct SSE endpoint that closes on `graph_completed` and cleans up on
client abort. `lib/agents/index.ts` already wires all three parsers + three
LLMs as parallel nodes plus synthesize/save nodes — this is the orchestration
the upload flow should be using. Auth scaffolding (`lib/supabase/{client,
server,service}.ts`, `app/auth/callback/route.ts`, `app/(auth)/{login,signup}`)
is clean. RLS policies in `lib/supabase/schema.sql` are well-scoped.

## What's broken

1. **`extract-text.ts` is broken against the installed pdf-parse v2.4.5.**
   The code does `import pdfParse from 'pdf-parse'; pdfParse(buffer).text`,
   but pdf-parse v2 has no default export — it ships a `PDFParse` class with
   a `getText()` method that returns a `TextResult`. Every upload will 500
   on the text-extraction step. This blocks the entire pipeline.
2. **`app/page.tsx` has no auth gate.** It renders `<ResumeUpload/>` for
   logged-out visitors, who then 401 the moment they drop a file. (Issue A)
3. **`/report/[resumeId]` does not exist.** `resume-upload.tsx` redirects
   there after analysis — every user gets a 404. (Issue B)
4. **`resume-upload.tsx` runs the pipeline client-side**, calling
   `/api/upload` → `/api/parse` → `/api/perceive` sequentially with
   `await fetch`. If the user closes the tab between parse and perceive,
   the perception step never runs. The graph executor exists for exactly
   this reason but is not used by the upload flow. (Issue C)
5. **`middleware.ts` is deprecated in Next.js 16** — renamed to `proxy.ts`
   with the function renamed from `middleware` to `proxy`. AGENTS.md is
   explicit about heeding deprecation notices.
6. **Affinda parser throws on missing key / API failure** rather than
   returning a `ParseResult` with populated `issues[]`. `runAllParsers`
   already wraps in `Promise.allSettled` so the pipeline survives, but
   the failure mode is silent (only console.error) and there is no row
   in `parse_results` capturing the error for downstream surfaces. (Issue D)
7. **`resumes` storage bucket is assumed to exist.** No bootstrap.
   On a fresh Supabase project, upload fails with a confusing storage
   error. (Issue E)

## What's vestigial

- `app/api/parse/route.ts` and `app/api/perceive/route.ts` are only
  reachable from `resume-upload.tsx`'s broken sequential flow. After
  Issue C is fixed (upload → analyze graph), these routes are unused.
  M1 keeps them in place — deleting them is out of scope; they may be
  useful for ad-hoc re-runs. They will be removed when the report UI
  lands in M13 if still unused.
- `app/api/test-perception/route.ts` and `app/test/page.tsx` are
  explicitly marked "smoke test only — no auth or DB." They duplicate
  the perceive flow against an inline text input. Useful for development;
  keep until M13.
- `lib/agents/save-results.ts` writes both `parse_results` and
  `perception_reports` from the graph context. Today the same writes
  also happen in `/api/parse` and `/api/perceive` — after Issue C
  unifies on the graph, only `save-results.ts` writes, and the
  duplicate write paths in `/api/parse|perceive` become dead code.

## Predictions for downstream milestones

- M2 will need a `parse_disagreement` table and per-parser canonical
  normalization. The current `ParsedResume` type is a reasonable start
  but lacks contact subtypes (linkedin/github/personal_url split) and
  per-experience bullet arrays — both will be added then.
- M3 will need an APEDS column on `perception_reports`, a fourth model
  (Together/Llama), and Upstash caching. Caching wraps the LLM calls
  in `lib/llm/{anthropic,openai,gemini,together}.ts` cleanly.
- The schema-as-single-file in `lib/supabase/schema.sql` works but
  must move to versioned `infra/supabase/migrations/` before M4 (per
  §4.3). Out of scope for M1.
