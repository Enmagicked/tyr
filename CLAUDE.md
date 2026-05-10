# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev                 # next dev (Next.js 16, React 19)
npm run build               # next build — also runs prompts.lock check via the test suite
npm run lint                # eslint (flat config: eslint.config.mjs)
npm test                    # node --test --experimental-strip-types over an explicit file list
npm run bootstrap           # one-time: create the private `resumes` Supabase Storage bucket
npm run sample:regen        # regenerate the sample report fixture under lib/sample/
```

`npm test` enumerates each test file explicitly in `package.json` — when adding a new `*.test.ts`, append it to the `test` script or it will not run. Run a single file with:

```bash
node --test --experimental-strip-types lib/path/to/file.test.ts
```

There is no separate typecheck script; use `npx tsc --noEmit` (the deploy runbook treats it as gating).

## Next.js 16 — non-obvious deviations

This repo is on Next.js 16 + React 19. AGENTS.md mandates reading `node_modules/next/dist/docs/` before writing Next code. A few load-bearing differences from older Next:

- **Middleware lives in `proxy.ts` at the repo root and exports `proxy`**, not `middleware.ts` / `middleware`. It guards `/upload`, `/report`, `/reports`, `/account` via Supabase SSR session cookies.
- React 19 + Next 16 server/client component split is enforced; client-only providers (e.g. PostHog wrapper described in `docs/DEPLOY.md`) need explicit `'use client'`.

## Architecture

The product (`tyr`) is a one-shot resume analyzer: a single upload fans out to 3 ATS parsers + 4 LLM "perception" passes in parallel, then computes cross-source disagreement. The whole pipeline is one expressible DAG.

### The graph runtime (`lib/graph/`)

`execute(nodes, ctx, emit, runId)` in [lib/graph/runtime.ts](lib/graph/runtime.ts) is a stateless DAG executor — all state lives in the local `ctx` object and `completed`/`failed` sets, nothing escapes the call. This is intentional: one process or fifty workers, zero code changes.

Two dependency kinds:
- `depends_on` — **hard**: if any listed dep fails, the node is skipped (emits `node_skipped`).
- `optional_deps` — **soft**: wait for the dep to finish (success *or* failure) before running.

The aggregate nodes (`parse_resume`, `perceive_resume`) list all data sources as `optional_deps`, so a missing API key for one model never kills the run. `save_results` is the same pattern at the end of the graph — it fails gracefully if Supabase env vars are missing.

### The analysis graph (`lib/agents/`)

[lib/agents/index.ts](lib/agents/index.ts) wires every node. Adding a new signal source = adding one node here. The shape today:

```
load_resume
 ├─ parse_{affinda,openresume,naive}    → parse_resume (aggregate)
 └─ perceive_{gpt4o,claude,gemini,llama} → perceive_resume (aggregate)
                                            │
parse_resume   ─→ compute_disagreement     │
                  compute_perception_disagreement ←─ (needs both halves)
parse_resume   ─→ analyze_bullets
                  synthesize_summary  (Claude, after disagreement+bullets)
                  save_results        (always last, soft deps on everything)
```

Per-node files live alongside in `lib/agents/`. LLM call adapters per provider are in [lib/llm/](lib/llm/) (`openai.ts`, `anthropic.ts`, `gemini.ts`, `together.ts`), each fronted by [lib/llm/perceive.ts](lib/llm/perceive.ts) which handles caching + the 8 perception queries.

### Streaming progress (`lib/event-broker.ts` + `app/api/stream/[runId]`)

[lib/event-broker.ts](lib/event-broker.ts) is an in-process pub/sub with **history replay** so late-joining SSE clients don't miss events, and a `tasks` map that holds strong refs to background promises so Node doesn't GC them mid-run. Same interface as Redis pub/sub; swap implementations when scale demands. `POST /api/analyze` returns a `runId` immediately and runs the graph in the background; the client opens an SSE connection to `/api/stream/[runId]` to watch `node_started` / `node_completed` / `node_failed` / `graph_completed` events.

### Prompt cache versioning — load-bearing invariant

[lib/llm/prompts.lock.json](lib/llm/prompts.lock.json) pins SHA-256 hashes of every rendered perception prompt. [lib/llm/__tests__/prompts.test.ts](lib/llm/__tests__/prompts.test.ts) asserts the live hashes match. **If you change a prompt template:**

1. Regenerate the lock file (command is documented in the lock's `comment` field).
2. Bump the cache namespace in [lib/llm/perceive.ts](lib/llm/perceive.ts) (`apeds:v2` → `apeds:v3`) so stale Upstash-cached completions don't get returned for the new prompt.

Skipping step 2 silently serves stale responses to the disagreement math — there's no runtime detection.

### Persistence

Supabase (Postgres + Auth + Storage). Migrations are numbered files in [infra/supabase/migrations/](infra/supabase/migrations/) and must be applied in order. `0002_baseline.sql` is currently untracked; treat the existing numbered set as the source of truth and resolve before relying on the deploy runbook's listing. Three Supabase clients in [lib/supabase/](lib/supabase/): `client.ts` (browser), `server.ts` (RSC, anon key, respects RLS), `service.ts` (service role, bypasses RLS — only used from `save_results` and similar trusted paths).

Upstash Redis caches LLM completions (see prompt-version note above).

## Docs to read for context

- [docs/DEPLOY.md](docs/DEPLOY.md) — full Vercel + Supabase + Upstash runbook, env var inventory, smoke-test checklist.
- [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) — tiered triage of follow-ups.
- `docs/MILESTONE_*_VERIFICATION.md` — what each milestone shipped + acceptance evidence.
