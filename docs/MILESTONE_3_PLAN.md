# Milestone 3 — APEDS LLM disagreement, 4th model, caching

Pre-implementation plan. Fulfills the LLM half of §7 APEDS. Companion docs:
[MILESTONE_1_AUDIT.md](MILESTONE_1_AUDIT.md), [MILESTONE_1_VERIFICATION.md](MILESTONE_1_VERIFICATION.md),
[MILESTONE_2_PLAN.md](MILESTONE_2_PLAN.md), [MILESTONE_2_VERIFICATION.md](MILESTONE_2_VERIFICATION.md).

## Why this milestone

The M1 audit's "Predictions for downstream milestones" called this out:

> M3 will need an APEDS column on `perception_reports`, a fourth model
> (Together/Llama), and Upstash caching. Caching wraps the LLM calls
> in `lib/llm/{anthropic,openai,gemini,together}.ts` cleanly.

And the M2 plan promised:

> M3 will reuse `lib/agents/disagreement.ts` patterns for the LLM half:
> same shape (pairwise → aggregate), different metrics (numerical σ
> over scalar judgments, embedding cosine ρ over reasoning text).

Today the 3 LLMs run with ad-hoc prompts and a freeform `synthesize_perception`
aggregate. There is no structured query suite, no per-prompt
disagreement, no reasoning embedding, no AI-perception vector, and
no LLM cache — meaning every analysis pays full LLM cost and the
APEDS signal that the architecture was designed around is invisible.
M3 fixes all of this.

## Issues to resolve

| # | Issue | Target file |
|---|---|---|
| M | Only 3 LLMs; spec calls for ≥4 heterogeneous judges (target: GPT-4o + Claude + Gemini + Llama-3.1-70B via Together) | `lib/llm/together.ts` (new), `lib/agents/llm.ts` |
| N | LLM prompts are freeform; spec calls for a structured 8-query suite (q1-q8 in §7.2) returning JSON | `lib/llm/prompts.ts` (rewrite), `lib/llm/perceive.ts` (new shared invoker) |
| O | No σ_j (numerical disagreement on scalar queries) | `lib/agents/perception-disagreement.ts` (new) |
| P | No ρ_j (reasoning-embedding cosine dispersion, à la DiscoUQ) | same + `lib/llm/embed.ts` (new) |
| Q | No δ (inter-modal LLM-vs-ATS disagreement) — needs M2's `level_inferred` | same |
| R | No `pairwiseDisagreement<T>` shared helper — M2 has its own copy in `lib/agents/disagreement.ts` | `lib/disagreement/pairwise.ts` (new), refactor M2 to consume it |
| S | No LLM cache — every request pays full cost; spec targets ≥70% hit rate (§11.2) | `lib/llm/cache.ts` (new, Upstash Redis) |
| T | No raw APEDS feature vector persisted; without it, the M5+ learned projection φ has no input schema | `apeds_features` JSONB on `perception_reports` |
| U | No AI-legibility score surfaced in UI (§7.7) | `app/report/[resumeId]/page.tsx` |
| V | All-LLM-failure case not handled — graph completes but `apeds_features` is null with no audit trail | `lib/agents/perception-disagreement.ts` |

## New components

### 4th LLM — `lib/llm/together.ts`

Together AI's OpenAI-compatible endpoint. Default model: `meta-llama/Llama-3.1-70B-Instruct-Turbo`. Same interface as the other 3 clients:

```ts
export async function callTogether(prompt: string, opts?: {
  model?: string
  temperature?: number
  responseFormat?: 'json_object' | 'text'
}): Promise<{ text: string; latency_ms: number }>
```

Env: `TOGETHER_API_KEY`. Add to `.env.local.example`. If unset, the
`perceive_llama` node fails-soft like the existing 3 models — the
aggregate runs on whatever subset succeeded (M1 pattern preserved).

### Structured prompt suite — `lib/llm/prompts.ts`

Replace the current freeform prompts with the §7.2 query suite. Each query has a stable `key` (used as cache + DB column key), a prompt template, and an expected JSON schema.

```ts
export type PerceptionQueryKey =
  | 'seniority'              // q1: int 1-10
  | 'technical_depth'        // q2: int 1-10
  | 'top_strengths'          // q3: list of 3 strings
  | 'fit'                    // q4: int 1-10 (target role-conditional)
  | 'final_round_probability'// q5: float 0-1
  | 'key_credential'         // q6: string
  | 'missing_signal'         // q7: string
  | 'ai_authored'            // q8: float 0-1

export type PerceptionResponse = {
  key: PerceptionQueryKey
  scalar?: number             // present for q1/q2/q4/q5/q8
  list?: string[]             // present for q3
  text?: string               // present for q6/q7
  reasoning: string           // always present — used for ρ_j
}
```

All queries return `{ scalar?, list?, text?, reasoning }` JSON via the
`responseFormat: 'json_object'` flag where supported, with a parser
fallback for Llama. Use `temperature = 0` and `n_samples = 1` for
M3 (self-consistency 3-sampling deferred per §11.2 cost target).

For M3, the target role for q4 is hardcoded to "the most-likely target
role inferred from the resume's most-recent experience function." M4
will make target a user input.

### Shared LLM invoker — `lib/llm/perceive.ts`

One function `perceive(model, query, resumeText) → PerceptionResponse` that:
1. Computes cache key `sha256(model + query.key + resumeText)`.
2. Checks Upstash; returns cached on hit.
3. Calls the model client with the structured prompt.
4. Parses JSON; validates against the query's expected schema.
5. Embeds the `reasoning` string via OpenAI `text-embedding-3-small`
   (cached separately by `sha256(reasoning)`).
6. Stores both result and embedding in cache (TTL: 30 days).
7. Returns `{ ...response, reasoning_embedding: number[1536] }`.

### Upstash cache — `lib/llm/cache.ts`

```ts
export async function cacheGet<T>(key: string): Promise<T | null>
export async function cacheSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
```

Backed by `@upstash/redis`. Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Fail-soft: if Upstash is unreachable, log and proceed without caching (do not fail the request). All cached values are JSON-serialized; embeddings stored as float32 arrays via `Buffer` base64 to keep the payload small.

Cache key namespace: `apeds:v1:{model}:{query_key}:{resume_hash}` for completions, `apeds:v1:embed:{text_hash}` for embeddings. Bump `v1` when prompt templates change.

### Embedding client — `lib/llm/embed.ts`

```ts
export async function embed(text: string): Promise<Float32Array>  // length 1536
```

OpenAI `text-embedding-3-small`. Reuses the existing OpenAI client. Cached via `cache.ts`.

### Generic disagreement helper — `lib/disagreement/pairwise.ts`

Refactor target — extract from M2's `lib/agents/disagreement.ts`:

```ts
export type PairwiseConfig<T> = {
  scalarMetrics?: Record<string, (a: T, b: T) => number>   // 0=identical, 1=different
  setMetrics?: Record<string, (a: T, b: T) => number>
  vectorMetrics?: Record<string, (a: T, b: T) => number>   // for embeddings
}

export function pairwiseDisagreement<T>(
  items: { source: string; value: T }[],
  config: PairwiseConfig<T>
): {
  pairs: { a: string; b: string; metrics: Record<string, number> }[]
  aggregate: Record<string, number>   // mean over pairs per metric
}
```

After extraction, both `lib/agents/disagreement.ts` (M2 parser) and
`lib/agents/perception-disagreement.ts` (M3 LLM) consume it.
Acceptance: M2 verification still passes after refactor.

### LLM disagreement scorer — `lib/agents/perception-disagreement.ts`

Per query, across the 2–4 surviving models, compute:

```ts
type PerceptionDisagreement = {
  per_query: Record<PerceptionQueryKey, {
    mean_scalar?: number
    sigma_scalar?: number       // σ_j — std of numeric answers
    rho_reasoning: number        // ρ_j — 1 − mean cosine of reasoning embeddings
    n_responding: number         // 2..4
  }>
  inter_modal_delta: number      // |LLM-mean seniority − ATS-derived level|, normalized to [0,1]
  overall_disagreement: number   // weighted aggregate ∈ [0,1]
}
```

Where `inter_modal_delta` reads `experience[0].level_inferred` from M2's `parse_resume` output (mapped to a 1–10 scale: intern=2, junior=4, mid=6, senior=8, lead=9, exec=10) and compares to mean LLM seniority.

Edge cases:
- 0 LLMs succeeded → write `apeds_features = null` with `normalization_issues: [{ severity: 'high', ... }]` on `perception_reports`. Do not fail the graph.
- 1 LLM succeeded → σ_j and ρ_j undefined; write per_query with `sigma_scalar: null, rho_reasoning: null, n_responding: 1`.
- M2's `parse_resume` failed entirely → `inter_modal_delta: null`.

### Raw APEDS feature vector — persisted on `perception_reports`

The §7.4 64-d learned projection φ is **deferred to M5+** because there is no outcome data to train against. M3 instead persists a flat raw feature vector (~50 dims) so M5 can train φ on it without a schema change:

```ts
type ApedsRawFeatures = {
  // Per-query means and sigmas (q1, q2, q4, q5, q8 are scalar)
  mean_seniority: number
  sigma_seniority: number | null
  mean_technical_depth: number
  sigma_technical_depth: number | null
  mean_fit: number
  sigma_fit: number | null
  mean_final_round_prob: number
  sigma_final_round_prob: number | null
  mean_ai_authored: number
  sigma_ai_authored: number | null
  // Per-query reasoning dispersion (all 8 queries)
  rho_seniority: number | null
  rho_technical_depth: number | null
  rho_top_strengths: number | null
  rho_fit: number | null
  rho_final_round_probability: number | null
  rho_key_credential: number | null
  rho_missing_signal: number | null
  rho_ai_authored: number | null
  // Inter-modal
  inter_modal_delta: number | null
  // ATS-side (read from M2's parse_disagreement)
  ats_legibility: number             // mean canonical_data fill rate
  ats_fragility: number              // variance of fill rate across parsers
  // Aggregate
  overall_llm_disagreement: number
  overall_parse_disagreement: number  // copied from parse_disagreement.overall_score
  // Counts
  n_llms_responding: number          // 0..4
  n_parsers_responding: number       // 0..3 (from M2)
}
```

### AI-legibility score — `lib/agents/ai-legibility.ts`

§7.7 formula with **hardcoded placeholder weights** (M5 will learn these against outcome data):

```ts
export function aiLegibilityScore(features: ApedsRawFeatures): number {
  // Placeholder weights from spec §7.7 synthetic eval — NOT learned.
  const w1 = 0.6, w2 = 0.4, w3 = 0.35, w4 = 0.25
  const meanSigma = mean([
    features.sigma_seniority,
    features.sigma_technical_depth,
    features.sigma_fit,
  ].filter(x => x !== null))
  const auth = 1 - features.mean_ai_authored   // 1 = human, 0 = AI
  const z = w1 * features.ats_legibility
          - w2 * features.ats_fragility
          - w3 * (meanSigma ?? 0) / 5         // normalize σ to ~[0,1]
          + w4 * auth
  return Math.round(100 * sigmoid(z))
}
```

Surface as the user-facing badge with explicit caveat copy: *"Placeholder weights — calibration against real outcome data lands in M5."*

### New graph nodes

In `lib/agents/index.ts`:

```ts
{
  name: 'perceive_llama',
  fn: perceiveLlama,
  depends_on: ['load_resume'],
},
// existing perceive_resume aggregate adds 'perceive_llama' to optional_deps
{
  name: 'compute_perception_disagreement',
  fn: computePerceptionDisagreement,
  optional_deps: ['perceive_resume', 'compute_disagreement'],   // needs both halves
},
// save_results adds 'compute_perception_disagreement' to optional_deps
```

The 4 model nodes now invoke `perceive(model, query, text)` for each of the 8 queries (4 × 8 = 32 calls per resume on a cold cache, 32 × 0.3 = ~10 calls on a steady-state warm cache assuming 70% hit rate).

## Schema additions

### `infra/supabase/migrations/0003_apeds_features.sql`

```sql
alter table perception_reports
  add column apeds_features jsonb,
  add column ai_legibility_score integer
    check (ai_legibility_score is null or (ai_legibility_score >= 0 and ai_legibility_score <= 100)),
  add column normalization_issues jsonb not null default '[]'::jsonb;

-- Per-(model, query) raw responses for audit + future re-aggregation
create table perception_query_responses (
  id uuid default uuid_generate_v4() primary key,
  resume_id uuid references resumes on delete cascade not null,
  model_name text not null,
  query_key text not null,
  scalar numeric,
  list_value jsonb,
  text_value text,
  reasoning text not null,
  reasoning_embedding_hash text not null,    -- SHA256, embedding stored in cache only
  cache_hit boolean not null default false,
  latency_ms integer,
  responded_at timestamptz default now(),
  unique (resume_id, model_name, query_key)
);

alter table perception_query_responses enable row level security;

create policy "users view own perception query responses" on perception_query_responses for select
  using (exists (
    select 1 from resumes
    where resumes.id = perception_query_responses.resume_id
      and resumes.candidate_id = auth.uid()
  ));

create index on perception_query_responses (resume_id);
create index on perception_query_responses (model_name, query_key);
```

The existing `llm_responses` table stays for audit but is no longer the source of truth for perception data — `perception_query_responses` is the structured replacement. M2's pattern: leave the old in place, point new code at the new table, deprecate in M13.

## Acceptance criteria

| # | Criterion | Status type |
|---|---|---|
| 1 | `npx tsc --noEmit` and `npx next build` clean | AUTO |
| 2 | All 4 LLM clients implement the same interface; `lib/llm/together.ts` exists with Llama-3.1-70B default | AUTO |
| 3 | All 8 queries (q1-q8) defined in `lib/llm/prompts.ts` with stable keys; each model invoked for each query | AUTO + RUNTIME |
| 4 | Cache hit rate ≥70% on a 5-resume eval set after first warm pass (each resume run twice) | RUNTIME |
| 5 | When Upstash is unreachable, the graph still completes (cache fail-soft) | AUTO |
| 6 | `perception_query_responses` has `n_models × 8` rows per analyzed resume (n_models ∈ 1..4 based on which keys are set) | RUNTIME |
| 7 | `perception_reports.apeds_features` is non-null with all expected keys when ≥2 LLMs succeeded | RUNTIME |
| 8 | When 1 LLM fails, σ_j and ρ_j computed over surviving models; `n_llms_responding` correctly recorded | AUTO |
| 9 | When all 4 LLMs fail, `apeds_features` is null and `normalization_issues` populated with severity:high | AUTO |
| 10 | `inter_modal_delta` populated when both `parse_resume` and ≥1 LLM succeeded; null otherwise | AUTO |
| 11 | M2 acceptance criteria still pass after the `pairwiseDisagreement<T>` refactor — re-run `npm test` for `disagreement.test.ts` | AUTO |
| 12 | `ai_legibility_score ∈ [0, 100]` populated whenever `apeds_features` is non-null | AUTO |
| 13 | Report page surfaces (a) AI-legibility badge with caveat copy, (b) per-query σ/ρ grid, (c) inter-modal delta indicator | RUNTIME |
| 14 | Migrations apply cleanly on a fresh Supabase project (`0001` → `0002` → `0003`) | RUNTIME |
| 15 | `npm test` — at least 30 new test cases for cache, prompts, perception-disagreement; all pass | AUTO |
| 16 | Graph emits `node_started`/`node_completed` for `perceive_llama` and `compute_perception_disagreement` | AUTO + RUNTIME |
| 17 | Cold-pass cost: ≤$0.30/resume (4 models × 8 queries + 32 embeddings); warm-pass: ≤$0.10/resume — measured on 5-resume eval | RUNTIME |

## Things deliberately NOT in M3

- The §7.4 *learned* 64-d projection φ — needs outcome data, deferred to M5+
- Self-consistency 3-sampling per query (3× cost) — defer to M5 if disagreement-AUC validation (§7.5) demands it
- Tyr-Auth (perplexity / burstiness / stylometric per-section authenticity) — M5+
- Outcome 5-layer schema (applied/responded/interviewed/offered/accepted) — M4
- Marketing landing page — M4
- Real report-page visual design (current report is functional but unstyled) — M4
- User-supplied target role for q4 — M4
- §5 TG-HCG, §6 CHPE, §8 conformal scoring — months 6+
- Disagreement-AUC empirical validation against outcomes (§7.5) — M5+ (no outcomes yet)

## Predictions for downstream milestones

- **M4 (UI + landing + outcome schema)** will want a single `/api/report/[id]`
  payload that joins `parse_disagreement` + `perception_query_responses` +
  `perception_reports.apeds_features`. M3 leaves all three queryable by
  `resume_id` so the join is one query. M4 also adds the user's target
  role/company input which feeds q4's prompt.
- **M5 (first labeled outcomes + φ training)** will train the 64-d
  projection on `apeds_features → outcome`. The flat feature schema in M3
  is intentionally shaped for this — no migration needed.
- **M5 will also re-learn the AI-legibility score weights**. The
  hardcoded w1..w4 in M3 are placeholders; the API surface is stable.
- **M6 (TG-HCG embeddings)** will append a `tg_hcg_embedding` column
  to `perception_reports` (or a parallel table). Independent from M3.
- **The cache will need eviction strategy** as prompt templates evolve.
  M3 uses a `v1` namespace; bump to `v2` when q1-q8 templates change
  (essentially flushing). Track template versions in
  `lib/llm/prompts.ts` and document in `docs/PROMPT_VERSIONS.md` (new).

## Risks

1. **Llama JSON-mode reliability.** Together's Llama endpoint supports
   `response_format: { type: 'json_object' }` but is less strict than
   GPT-4o. Add a JSON-repair fallback (parse → on failure, regex-extract
   the JSON object → on second failure, return reasoning-only and treat
   the scalar as null). Unit test against malformed Llama outputs.
2. **Embedding cost.** 32 embeddings/resume × $0.00002/1K tokens × ~50 tokens
   = $0.000032/resume — negligible. Real risk is rate limits on cold
   bursts; rate-limit the embed client to 100 RPM.
3. **σ_j only meaningful when ≥3 models respond.** With 2 models, σ
   is just half the absolute difference. Document in the UI: "Variance
   based on 2 models — interpret cautiously."
4. **ρ_j cosine baseline.** Random text-embedding-3-small embeddings
   have ~0.4 baseline cosine, not 0. Subtract a calibrated baseline
   (estimated on a held-out random-text sample) so ρ ≈ 0 means
   "indistinguishable from random." Hardcode the baseline as a constant
   for now; re-estimate quarterly.
5. **Cache poisoning across prompt revisions.** Strict requirement: any
   change to a prompt template MUST bump the cache version. Add a
   build-time assertion: hash all prompt templates and compare to a
   committed manifest in `lib/llm/prompts.lock.json`. Fail the build
   on mismatch unless the version is bumped.
6. **Inter-modal delta is fragile.** Mapping `level_inferred` (intern/
   junior/mid/senior/lead/exec) to a 1–10 scale is judgment-call; the
   LLMs return seniority on 1–10 with their own implicit scale. Two
   ways this misfires: (a) LLM uses 1–10 to mean experience-years not
   level; (b) ATS `level_inferred` is itself fragile early on. M3
   ships a v1 mapping and treats `inter_modal_delta` as a soft signal
   (don't gate any UI decision on it).
7. **All-LLM-failure path.** Rare but possible (network outage hitting
   all 4 providers simultaneously). The graph must still complete and
   the report page must render without crashing. Add a runtime test
   for this.

## Suggested implementation order

1. **Refactor first** — extract `pairwiseDisagreement<T>` into
   `lib/disagreement/pairwise.ts`, refactor M2's
   `lib/agents/disagreement.ts` to consume it. Run M2 tests; verify
   green.
2. **Cache** — `lib/llm/cache.ts` with Upstash + fail-soft.
   Unit-test fail-soft path with a mocked unreachable client.
3. **Embeddings** — `lib/llm/embed.ts` wrapping OpenAI embeddings,
   cached. Unit test.
4. **Structured prompts** — rewrite `lib/llm/prompts.ts` with the 8
   queries; add `lib/llm/prompts.lock.json` manifest + build-time
   hash check.
5. **Shared invoker** — `lib/llm/perceive.ts` (cache → call → parse →
   embed → cache). Unit-test JSON-repair fallback.
6. **4th LLM** — `lib/llm/together.ts`, then `perceiveLlama` in
   `lib/agents/llm.ts`. Wire into graph.
7. **Disagreement scorer** — `lib/agents/perception-disagreement.ts`
   consuming the shared helper. Unit-test scalar-σ, embedding-ρ, and
   inter-modal-δ paths separately, then end-to-end. Cover the 0/1/4
   responding-LLM cases.
8. **AI-legibility** — `lib/agents/ai-legibility.ts` with placeholder
   weights. Unit test.
9. **Schema** — `infra/supabase/migrations/0003_apeds_features.sql`.
   Update `save_results.ts` to write `apeds_features`,
   `ai_legibility_score`, `perception_query_responses`. Verify
   migration applies on a fresh project.
10. **Graph wiring** — add `perceive_llama` and
    `compute_perception_disagreement` nodes; update aggregate
    `optional_deps`.
11. **Report UI** — AI-legibility badge with caveat, per-query σ/ρ
    grid, inter-modal-δ indicator. Minimal styling — M4 redesigns
    this page anyway.
12. **Eval pass** — run the 5-resume eval set twice; record cache
    hit rate, cost, and acceptance criteria 4/6/7/10/13/17 in
    `docs/MILESTONE_3_VERIFICATION.md`.

Estimated 3–4 working sessions. Highest-risk pieces are (a) Llama
JSON-mode fallback and (b) the prompt-lockfile build check; everything
else is straightforward extension of M2's patterns.
