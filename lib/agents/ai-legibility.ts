// AI-legibility score (§7.7) — single 0..100 user-facing number that captures
// how confidently the LLM judges read this resume.
//
// IMPORTANT: weights w1..w4 are HARDCODED PLACEHOLDERS from the spec's
// synthetic eval. M5 will re-learn them against real outcome data once the
// outcome schema (M4) and labeled-outcomes (M5) ship. Until then, the UI
// MUST surface the caveat copy verbatim so users don't over-trust the number.

import type { ApedsRawFeatures } from './perception-disagreement.ts'

// Spec §7.7 placeholder weights. Document each so M5 understands what to vary.
const WEIGHTS = {
  ats_legibility: 0.6,    // higher = more parseable resume = LLMs see what ATS sees
  ats_fragility: 0.4,     // higher fragility = parsers disagree on fill = lowers score
  llm_disagreement: 0.35, // higher mean σ = LLMs disagree on numerics = lowers score
  human_authored: 0.25,   // (1 - mean_ai_authored) — human-feeling prose = boost
}

export const AI_LEGIBILITY_CAVEAT_COPY =
  'Placeholder weights — calibration against real outcome data lands in M5.'

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

function meanIgnoringNull(nums: (number | null)[]): number {
  const filtered = nums.filter((x): x is number => x !== null)
  if (filtered.length === 0) return 0
  return filtered.reduce((s, n) => s + n, 0) / filtered.length
}

export function aiLegibilityScore(f: ApedsRawFeatures): number {
  // Mean σ across the 3 most decision-relevant scalar queries (seniority,
  // technical_depth, fit). Normalize by 5 to map a typical 1-10 scale stdev
  // (~0..5) into ~[0,1].
  const meanSigma =
    meanIgnoringNull([f.sigma_seniority, f.sigma_technical_depth, f.sigma_fit]) / 5

  const auth =
    f.mean_ai_authored !== null ? 1 - f.mean_ai_authored : 0.5  // unknown → neutral

  const z =
    WEIGHTS.ats_legibility * f.ats_legibility -
    WEIGHTS.ats_fragility * f.ats_fragility -
    WEIGHTS.llm_disagreement * meanSigma +
    WEIGHTS.human_authored * auth

  return Math.round(100 * sigmoid(z))
}
