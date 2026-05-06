// Cross-LLM perception disagreement (M3, APEDS LLM half).
//
// For each of the 8 q1-q8 queries, across the 1-4 surviving models:
//   σ_j (sigma_scalar)   — population stdev of numeric answers (scalar queries)
//   ρ_j (rho_reasoning)  — calibrated dispersion of reasoning embeddings
//                          (1 - mean cosine, baseline-adjusted)
//   n_responding         — count of models that returned a parseable answer
//
// Inter-modal δ (inter_modal_delta) compares mean LLM seniority vs. ATS-derived
// `level_inferred` from M2's parse_resume. Mapping intern=2, junior=4, mid=6,
// senior=8, lead=9, exec=10 to the LLM 1-10 scale, normalized to [0,1] by
// dividing the absolute delta by 9.
//
// Edge cases:
//   - 0 LLMs succeeded → returns null + a high-severity normalization issue.
//   - 1 LLM succeeded → σ_j and ρ_j are null per query; n_responding=1.
//   - parse_resume failed → inter_modal_delta is null.

import type { CanonicalResume, NormalizationIssue, ParseResult } from '@/types'
import {
  PERCEPTION_QUERIES,
  type PerceptionQueryKey,
  PERCEPTION_QUERY_KEYS,
} from '../llm/prompts.ts'
import type { PerceiveResult } from '../llm/perceive.ts'
import { calibratedDispersion, cosineSimilarity } from '../llm/embed.ts'

export interface PerQueryStats {
  mean_scalar: number | null
  sigma_scalar: number | null
  rho_reasoning: number | null
  n_responding: number
}

export interface PerceptionDisagreement {
  per_query: Record<PerceptionQueryKey, PerQueryStats>
  inter_modal_delta: number | null
  overall_disagreement: number
  models_responding: string[]
  normalization_issues: NormalizationIssue[]
}

// Map M2's `level_inferred` to the same 1-10 scale used by the seniority query.
const LEVEL_TO_SCALE: Record<string, number> = {
  intern: 2,
  junior: 4,
  mid: 6,
  senior: 8,
  lead: 9,
  exec: 10,
}

function meanOf(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

function stdevOf(nums: number[]): number | null {
  if (nums.length < 2) return null
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length
  return Math.sqrt(variance)
}

function meanCosineAcrossPairs(embeddings: Float32Array[]): number | null {
  if (embeddings.length < 2) return null
  let sum = 0
  let count = 0
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      sum += cosineSimilarity(embeddings[i], embeddings[j])
      count += 1
    }
  }
  if (count === 0) return null
  return sum / count
}

function emptyPerQuery(): Record<PerceptionQueryKey, PerQueryStats> {
  const out: Partial<Record<PerceptionQueryKey, PerQueryStats>> = {}
  for (const k of PERCEPTION_QUERY_KEYS) {
    out[k] = { mean_scalar: null, sigma_scalar: null, rho_reasoning: null, n_responding: 0 }
  }
  return out as Record<PerceptionQueryKey, PerQueryStats>
}

// Pivot a flat list of per-(model, query) results into per-query buckets.
function bucketByQuery(
  results: PerceiveResult[]
): Record<PerceptionQueryKey, PerceiveResult[]> {
  const buckets: Partial<Record<PerceptionQueryKey, PerceiveResult[]>> = {}
  for (const k of PERCEPTION_QUERY_KEYS) buckets[k] = []
  for (const r of results) {
    if (PERCEPTION_QUERIES[r.query]) {
      buckets[r.query]!.push(r)
    }
  }
  return buckets as Record<PerceptionQueryKey, PerceiveResult[]>
}

function computeInterModalDelta(
  perQuery: Record<PerceptionQueryKey, PerQueryStats>,
  parseResults: ParseResult[] | null
): number | null {
  const seniority = perQuery.seniority
  if (!seniority || seniority.mean_scalar === null) return null
  if (!parseResults || parseResults.length === 0) return null

  // Pick the most-recent experience's level_inferred from any parser that has
  // one. Pluralities don't help here — the parsers should largely agree on
  // level_inferred at index 0 once M2 normalization is solid.
  let atsLevel: number | null = null
  for (const pr of parseResults) {
    const exp = pr.canonical_data?.experience?.[0]
    if (exp?.level_inferred && LEVEL_TO_SCALE[exp.level_inferred] !== undefined) {
      atsLevel = LEVEL_TO_SCALE[exp.level_inferred]
      break
    }
  }
  if (atsLevel === null) return null

  // Normalize |delta| by the max possible delta on the 1-10 scale (=9).
  return Math.min(1, Math.abs(seniority.mean_scalar - atsLevel) / 9)
}

export function computePerceptionDisagreement(
  results: PerceiveResult[],
  parseResults: ParseResult[] | null = null
): PerceptionDisagreement | null {
  // 0-LLM case: no per-query data — caller handles null.
  if (results.length === 0) {
    return null
  }

  const perQuery = emptyPerQuery()
  const buckets = bucketByQuery(results)
  const modelsResponding = [...new Set(results.map((r) => r.model))]

  for (const queryKey of PERCEPTION_QUERY_KEYS) {
    const bucket = buckets[queryKey] ?? []
    if (bucket.length === 0) continue

    const spec = PERCEPTION_QUERIES[queryKey]

    // Scalar stats
    let mean: number | null = null
    let sigma: number | null = null
    if (spec.shape === 'scalar') {
      const scalars = bucket
        .map((r) => r.response.scalar)
        .filter((x): x is number => typeof x === 'number')
      mean = meanOf(scalars)
      sigma = stdevOf(scalars)
    }

    // Reasoning-embedding dispersion (works for all shapes — reasoning is
    // always present)
    let rho: number | null = null
    const embeddings = bucket
      .map((r) => r.reasoning_embedding)
      .filter((e): e is Float32Array => e !== null && e.length > 0)
    const meanCos = meanCosineAcrossPairs(embeddings)
    if (meanCos !== null) {
      rho = calibratedDispersion(meanCos)
    }

    perQuery[queryKey] = {
      mean_scalar: mean,
      sigma_scalar: sigma,
      rho_reasoning: rho,
      n_responding: bucket.length,
    }
  }

  const interModalDelta = computeInterModalDelta(perQuery, parseResults)

  // Overall disagreement: mean of (mean σ across scalar queries, mean ρ across
  // all queries), each weighted equally. Both sub-aggregates are normalized
  // to [0,1] (σ divided by 5 to map a typical 1-10 variance to ~[0,1]).
  const sigmas = Object.values(perQuery)
    .map((s) => s.sigma_scalar)
    .filter((x): x is number => x !== null)
  const rhos = Object.values(perQuery)
    .map((s) => s.rho_reasoning)
    .filter((x): x is number => x !== null)

  const meanSigma = sigmas.length > 0 ? meanOf(sigmas)! : 0
  const meanRho = rhos.length > 0 ? meanOf(rhos)! : 0
  const overall = Math.max(0, Math.min(1, 0.5 * Math.min(1, meanSigma / 5) + 0.5 * meanRho))

  return {
    per_query: perQuery,
    inter_modal_delta: interModalDelta,
    overall_disagreement: overall,
    models_responding: modelsResponding,
    normalization_issues: [],
  }
}

// ---------------------------------------------------------------------------
// APEDS raw feature vector (~25 dims, persisted on perception_reports). M5+
// will train a 64-d learned projection φ on this.
// ---------------------------------------------------------------------------

export interface ApedsRawFeatures {
  // Per-query means + sigmas (scalar queries only)
  mean_seniority: number | null
  sigma_seniority: number | null
  mean_technical_depth: number | null
  sigma_technical_depth: number | null
  mean_fit: number | null
  sigma_fit: number | null
  mean_final_round_prob: number | null
  sigma_final_round_prob: number | null
  mean_ai_authored: number | null
  sigma_ai_authored: number | null
  // Reasoning dispersion (all 8 queries)
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
  // ATS-side, copied from M2's parse_disagreement
  ats_legibility: number
  ats_fragility: number
  // Aggregates
  overall_llm_disagreement: number
  overall_parse_disagreement: number | null
  // Counts
  n_llms_responding: number
  n_parsers_responding: number
}

function fillRate(canonical: CanonicalResume): number {
  let filled = 0
  let total = 0
  // Contact fields
  total += 5
  if (canonical.contact?.email) filled += 1
  if (canonical.contact?.phone) filled += 1
  if (canonical.contact?.linkedin_url) filled += 1
  if (canonical.contact?.github_url) filled += 1
  if (canonical.contact?.personal_urls && canonical.contact.personal_urls.length > 0) filled += 1
  // Sections
  total += 4
  if (canonical.name) filled += 1
  if (canonical.experience?.length > 0) filled += 1
  if (canonical.education?.length > 0) filled += 1
  if (canonical.skills?.length > 0) filled += 1
  return total > 0 ? filled / total : 0
}

function variance(nums: number[]): number {
  if (nums.length < 2) return 0
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length
  return nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length
}

export function buildApedsFeatures(args: {
  perception: PerceptionDisagreement | null
  parseResults: ParseResult[]
  parseDisagreementOverall: number | null
}): ApedsRawFeatures | null {
  if (!args.perception) return null

  const p = args.perception.per_query
  const parsers = args.parseResults

  const fillRates = parsers.map((pr) => fillRate(pr.canonical_data))
  const atsLegibility = fillRates.length > 0 ? meanOf(fillRates)! : 0
  const atsFragility = variance(fillRates)

  return {
    mean_seniority: p.seniority.mean_scalar,
    sigma_seniority: p.seniority.sigma_scalar,
    mean_technical_depth: p.technical_depth.mean_scalar,
    sigma_technical_depth: p.technical_depth.sigma_scalar,
    mean_fit: p.fit.mean_scalar,
    sigma_fit: p.fit.sigma_scalar,
    mean_final_round_prob: p.final_round_probability.mean_scalar,
    sigma_final_round_prob: p.final_round_probability.sigma_scalar,
    mean_ai_authored: p.ai_authored.mean_scalar,
    sigma_ai_authored: p.ai_authored.sigma_scalar,
    rho_seniority: p.seniority.rho_reasoning,
    rho_technical_depth: p.technical_depth.rho_reasoning,
    rho_top_strengths: p.top_strengths.rho_reasoning,
    rho_fit: p.fit.rho_reasoning,
    rho_final_round_probability: p.final_round_probability.rho_reasoning,
    rho_key_credential: p.key_credential.rho_reasoning,
    rho_missing_signal: p.missing_signal.rho_reasoning,
    rho_ai_authored: p.ai_authored.rho_reasoning,
    inter_modal_delta: args.perception.inter_modal_delta,
    ats_legibility: atsLegibility,
    ats_fragility: atsFragility,
    overall_llm_disagreement: args.perception.overall_disagreement,
    overall_parse_disagreement: args.parseDisagreementOverall,
    n_llms_responding: args.perception.models_responding.length,
    n_parsers_responding: parsers.length,
  }
}

// All-LLMs-failed normalization issue. The caller (save_results) merges this
// onto `perception_reports.normalization_issues`.
export const ALL_LLMS_FAILED_ISSUE: NormalizationIssue = {
  field: 'apeds_features',
  reason: 'All 4 LLMs failed for this resume. APEDS features unavailable; report rendered without LLM signals.',
  severity: 'high',
}
