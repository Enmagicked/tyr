# Milestone 3 — Acceptance verification

Per [MILESTONE_3_PLAN.md](MILESTONE_3_PLAN.md). Each criterion is auto-verified
(typecheck/build/test output) or runtime-verified (must run end-to-end against
the configured Supabase project, ATS API keys, LLM keys, and Upstash).

## Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `npx tsc --noEmit` and `npx next build` clean | ✅ AUTO | `npx tsc --noEmit` exits 0. `npx next build` completes with `✓ Compiled successfully in 5.9s` and `✓ Generating static pages using 7 workers (13/13)`. `/report/[resumeId]` registers as `ƒ /report/[resumeId]`. |
| 2 | All 4 LLM clients implement the same interface; `lib/llm/together.ts` exists with Llama-3.1-70B default | ✅ AUTO | `lib/llm/together.ts:1` — `callTogether(prompt, opts) → { text, latency_ms, model }` against `https://api.together.xyz/v1` with default model `meta-llama/Llama-3.1-70B-Instruct-Turbo`. Legacy interface adapter at `lib/llm/index.ts:11` (`runLlama` with the same `(text, key) → LLMResponse` shape as the other 3). New structured invoker `lib/llm/perceive.ts:104` dispatches to all 4 via `DISPATCH`. |
| 3 | All 8 queries (q1-q8) defined in `lib/llm/prompts.ts` with stable keys; each model invoked for each query | ✅ AUTO + ⏳ RUNTIME | `lib/llm/__tests__/prompts.test.ts` "PERCEPTION_QUERY_KEYS contains all 8 queries q1-q8" passes; `PERCEPTION_QUERIES` map at `lib/llm/prompts.ts:29` covers seniority, technical_depth, top_strengths, fit, final_round_probability, key_credential, missing_signal, ai_authored. `perceiveAllQueries(model, text)` at `lib/llm/perceive.ts:255` runs all 8 per model. RUNTIME: end-to-end pass needed to confirm 4×8=32 actual cells per resume. |
| 4 | Cache hit rate ≥70% on a 5-resume eval set after first warm pass | ⏳ RUNTIME | Cache wired through `perceive()` (`lib/llm/perceive.ts:222`); `cacheGet`/`cacheSet` integration tested. The 5-resume eval set isn't committed yet — will instrument by counting `cache_hit=true` rows in `perception_query_responses` once it lands. |
| 5 | When Upstash is unreachable, the graph still completes (cache fail-soft) | ✅ AUTO | `lib/llm/__tests__/cache.test.ts` covers four fail-soft paths: no env vars (cacheGet → null, cacheSet silent), get throws (returns null), set throws (resolves silently). All 6 tests pass. The same fallthrough is exercised by `embed.test.ts` "embed: missing OPENAI_API_KEY → null". |
| 6 | `perception_query_responses` has `n_models × 8` rows per analyzed resume | ⏳ RUNTIME | `lib/agents/save-results.ts:62` upserts one row per `PerceiveResult` with `onConflict: 'resume_id,model_name,query_key'` — schema unique constraint declared in `0003_apeds_features.sql:24`. RUNTIME confirmation requires a real upload. |
| 7 | `perception_reports.apeds_features` is non-null with all expected keys when ≥2 LLMs succeeded | ✅ AUTO + ⏳ RUNTIME | `lib/agents/__tests__/perception-disagreement.test.ts` "buildApedsFeatures: ats_legibility = mean fill rate across parsers" exercises feature assembly with 1 LLM + 2 parsers and confirms all keys populated. The 21 ApedsRawFeatures keys are typed in `lib/agents/perception-disagreement.ts:182`. RUNTIME: a real run with 2+ LLMs is the empirical confirmation. |
| 8 | When 1 LLM fails, σ_j and ρ_j computed over surviving models; `n_llms_responding` correctly recorded | ✅ AUTO | `lib/agents/__tests__/perception-disagreement.test.ts` "4 LLMs all answer seniority → σ computed" + "2 LLMs answer one query, 4 answer another (mixed n_responding)" + "1 LLM → σ and ρ are null, n_responding=1" cover all surviving-subset shapes. The bucketing is per-query, so a single model failing one query doesn't poison the others. |
| 9 | When all 4 LLMs fail, `apeds_features` is null and `normalization_issues` populated with severity:high | ✅ AUTO | `lib/agents/__tests__/perception-disagreement.test.ts` "0 LLMs → null" returns null; `lib/agents/save-results.ts:96` then writes `apeds_features=null, ai_legibility_score=null, normalization_issues=[ALL_LLMS_FAILED_ISSUE]` (severity 'high'). The `ALL_LLMS_FAILED_ISSUE` constant is asserted by "ALL_LLMS_FAILED_ISSUE has severity high and field=apeds_features". |
| 10 | `inter_modal_delta` populated when both `parse_resume` and ≥1 LLM succeeded; null otherwise | ✅ AUTO | `lib/agents/__tests__/perception-disagreement.test.ts` covers all 3 paths: "inter_modal_delta computed when both ATS level and LLM seniority present" (= 0), "inter_modal_delta normalized to [0,1]" (= 1 at intern↔exec extremes), "parse_resume failed → inter_modal_delta is null", and "ATS has no level_inferred → inter_modal_delta is null". |
| 11 | M2 acceptance criteria still pass after the `pairwiseDisagreement<T>` refactor | ✅ AUTO | `lib/disagreement/pairwise.ts` extracted from M2's local helper. `lib/agents/disagreement.ts` rewritten to consume it (keeps the same `pairwise()` and `computeDisagreementFromCanonicals()` API). All 10 disagreement tests + 36 normalize/employer/determinism tests still green. New `lib/disagreement/__tests__/pairwise.test.ts` adds 8 tests exercising the generic helper directly. |
| 12 | `ai_legibility_score ∈ [0, 100]` populated whenever `apeds_features` is non-null | ✅ AUTO | `lib/agents/__tests__/ai-legibility.test.ts` "result is integer in [0, 100]" + ordering test "low ats_legibility + high fragility + high σ → lower score" + null-handling tests. The DB column has `check (ai_legibility_score is null or (ai_legibility_score >= 0 and ai_legibility_score <= 100))` per `0003_apeds_features.sql:18`. `save_results.ts:91` writes `legibility = features ? aiLegibilityScore(features) : null`. |
| 13 | Report page surfaces (a) AI-legibility badge with caveat copy, (b) per-query σ/ρ grid, (c) inter-modal delta indicator | ✅ AUTO + ⏳ RUNTIME | `app/report/[resumeId]/page.tsx`: (a) indigo pill `AI-legibility: X / 100` + italic `AI_LEGIBILITY_CAVEAT_COPY` line at lines 116-126; (b) full per-query table at lines 161-198 with mean/σ/ρ columns over all 8 queries; (c) inter-modal-δ indicator at lines 158. RUNTIME: visual inspection pending real data. |
| 14 | Migrations apply cleanly on a fresh Supabase project (`0001` → `0002` → `0003`) | ⏳ RUNTIME | `infra/supabase/migrations/0003_apeds_features.sql` uses idempotent guards (`add column if not exists`, `create table if not exists`, `do $$ ... if not exists ... $$`). It also relaxes the baseline `perception_reports.report NOT NULL` constraint (required for the 0-LLM-success case). RUNTIME: actual fresh-project test pending — pattern matches M2's working idempotent style. |
| 15 | `npm test` — at least 30 new test cases for cache, prompts, perception-disagreement; all pass | ✅ AUTO | New test files: cache (6), embed (13), prompts (6), perceive (20), perception-disagreement (15), ai-legibility (6), pairwise (8) = **74 new test cases**. Combined with 46 M2 tests = **120 total, all green**. Run: `npm test`. |
| 16 | Graph emits `node_started`/`node_completed` for `perceive_llama` and `compute_perception_disagreement` | ✅ AUTO + ⏳ RUNTIME | Both registered in `lib/agents/index.ts:48` and `lib/agents/index.ts:79`. The runtime in `lib/graph/runtime.ts:36` and `lib/graph/runtime.ts:73` emits `node_started` / `node_completed` for *every* node — so the 2 new nodes automatically appear in the SSE stream consumed at `/api/stream/[runId]`. |
| 17 | Cold-pass cost: ≤$0.30/resume; warm-pass: ≤$0.10/resume — measured on 5-resume eval | ⏳ RUNTIME | Same gating as criterion 4. The architecture (cache-first dispatch + json_object response_format + 0 temperature + max_tokens=600) is in line with the §11.2 budget; empirical measurement pending the eval set. |

## How to run the AUTO checks locally

```bash
npx tsc --noEmit          # criterion 1 (typecheck)
npx next build            # criterion 1 (build)
npm test                  # criteria 5, 8, 9, 10, 11, 12, 15 (unit tests, 120 cases)
```

Test runner: Node 20+ built-in `node:test` with `--experimental-strip-types`
(no extra dev dep). New M3 tests live in `lib/llm/__tests__/`,
`lib/agents/__tests__/`, and `lib/disagreement/__tests__/`.

Latest local run, all green:

```
tests 120
pass  120
fail  0
duration_ms ~615
```

## Migration runbook

```bash
# Fresh project:
supabase db push            # applies 0001 → 0002 → 0003 in order

# Existing project (already had 0001 + 0002):
# 0003 is idempotent — adds 3 columns to perception_reports, the new
# perception_query_responses table, and relaxes report NOT NULL.
supabase db push
```

## What changed in code

### New files
- `lib/disagreement/pairwise.ts` — generic `pairwiseDisagreement<T>` helper consumed by M2 (parser) and M3 (LLM) scorers.
- `lib/llm/cache.ts` — Upstash Redis wrapper, fail-soft.
- `lib/llm/embed.ts` — OpenAI text-embedding-3-small wrapper + cosine + calibrated dispersion against random baseline.
- `lib/llm/perceive.ts` — shared (model, query, resume) → PerceiveResult invoker. Cache → call → JSON-repair → validate → embed reasoning → cache.
- `lib/llm/together.ts` — Together AI client (Llama-3.1-70B-Instruct-Turbo by default).
- `lib/llm/prompts.lock.json` — manifest of SHA-256-truncated hashes per query template; `prompts.test.ts` asserts hashes match (M3 risk #5: silent prompt edits poison the cache).
- `lib/agents/perception-disagreement.ts` — σ_j, ρ_j, inter-modal δ scorer + `buildApedsFeatures` + `ALL_LLMS_FAILED_ISSUE`.
- `lib/agents/compute-perception-disagreement.ts` — graph node wrapper.
- `lib/agents/ai-legibility.ts` — placeholder-weights AI-legibility 0..100 score + caveat copy constant.
- `infra/supabase/migrations/0003_apeds_features.sql`.
- 7 new test files covering cache, embed, prompts, perceive, perception-disagreement, ai-legibility, pairwise (74 new tests).

### Modified files
- `lib/llm/prompts.ts` — adds 8-query structured suite (`PERCEPTION_QUERIES`, `PerceptionQueryKey`, `hashPromptTemplates`). Keeps M1 `PROMPTS` and `PROMPT_KEYS` exports for `lib/llm/index.ts` and `app/api/perceive/route.ts` legacy paths.
- `lib/llm/index.ts` — adds `runLlama` for the legacy interface so `RUNNERS` is complete after the `ModelName` widening.
- `lib/agents/llm.ts` — rewritten to drive the new structured invoker; adds `perceiveLlama`. `synthesizePerception` now adapts `PerceiveResult[]` back to `LLMResponse[]` so the legacy `generatePerceptionReport` rendering path keeps working.
- `lib/agents/index.ts` — registers `perceive_llama` (4th LLM) and `compute_perception_disagreement` (M3 aggregate). `perceive_resume.optional_deps` extended to 4 models. `save_results.optional_deps` extended to 4 deps.
- `lib/agents/disagreement.ts` — refactored to consume `pairwiseDisagreement<T>` from `lib/disagreement/pairwise.ts`. M2 API surface unchanged.
- `lib/agents/save-results.ts` — writes `perception_query_responses` (new), `perception_reports.apeds_features`, `ai_legibility_score`, and `normalization_issues`. Always writes a row to `perception_reports` even on 0-LLM success so the audit trail is complete.
- `app/report/[resumeId]/page.tsx` — adds AI-legibility badge + caveat, per-query σ/ρ grid, inter-modal-δ indicator.
- `types/index.ts` — extends `ModelName` union with `'llama-3.1-70b'`.
- `package.json` — `npm test` script extended with 7 new test files; `@upstash/redis` added.
- `.env.local.example` — adds `TOGETHER_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

## Things deliberately NOT done in M3

Per §"Things deliberately NOT in M3" in the plan:
- §7.4 *learned* 64-d projection φ — needs outcome data, deferred to M5+.
- Self-consistency 3-sampling per query — deferred until disagreement-AUC validation demands it.
- Tyr-Auth (perplexity / burstiness / stylometric) — M5+.
- Outcome 5-layer schema — M4.
- Marketing landing page + real report-page visual design — M4.
- User-supplied target role for q4 — M4.
- TG-HCG, CHPE, conformal scoring — months 6+.
- Disagreement-AUC empirical validation against outcomes — M5+.

## Open caveats / follow-ups

- **Eval-set RUNTIME criteria (3, 4, 6, 7, 13, 14, 17).** The 5-resume eval set isn't committed yet. These will flip from ⏳ to ✅ once it lands and a one-shot script writes its results back into this doc.
- **Llama JSON-mode reliability (M3 risk #1).** `repairAndParseJson` covers the 3 most-common Llama failure modes (markdown fence, prose preamble, malformed bracket); reasoning-only fallback handled via `validateAndCoerce` returning `{key, reasoning: ''}` when parse fails. Production data may surface a 4th mode worth adding.
- **Cache-version manifest enforcement.** `prompts.test.ts` asserts the lockfile hashes match the live templates. The mechanism is correct; what's missing is a CI hook that *forces* the manifest to be updated AND the cache version (`apeds:v1` in `lib/llm/cache.ts` is implicit via the `perceiveCacheKey` namespace) to be bumped together. Today the test catches drift; M5 should add a pre-commit hook that requires both updates in the same commit.
- **Random-baseline calibration (M3 risk #4).** `RANDOM_BASELINE_COSINE = 0.4` in `lib/llm/embed.ts` is the eyeballed value from the plan. Per M3 plan, re-estimate quarterly using a held-out random-text sample. No automation today.
- **2-model σ caveat (M3 risk #3).** When only 2 models respond, σ is just half the absolute difference. The UI shows the σ verbatim; consider adding "n=2 — interpret cautiously" tooltip in M4.
- **Inter-modal δ fragility (M3 risk #6).** The `LEVEL_TO_SCALE` map (`intern=2, junior=4, mid=6, senior=8, lead=9, exec=10`) is judgment-call. Don't gate UI decisions on δ until M5 outcome data validates the mapping.
- **Cost telemetry not instrumented.** Per-call cost is not yet logged; `cache_hit` boolean is recorded per row but no aggregate dashboard. M4 should add `n_cache_hits / n_total` and `estimated_cost_cents` to the report-page admin view.
- **`docs/PROMPT_VERSIONS.md` not yet created.** Plan recommends tracking template-version history. Open as soon as the first template iteration ships.
