// Tests AI-legibility score (acceptance criterion 12: ∈ [0, 100]).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { aiLegibilityScore, AI_LEGIBILITY_CAVEAT_COPY } from '../ai-legibility.ts'
import type { ApedsRawFeatures } from '../perception-disagreement.ts'

function makeFeatures(overrides: Partial<ApedsRawFeatures> = {}): ApedsRawFeatures {
  return {
    mean_seniority: 7,
    sigma_seniority: 0.5,
    mean_technical_depth: 7,
    sigma_technical_depth: 0.5,
    mean_fit: 6,
    sigma_fit: 0.5,
    mean_final_round_prob: 0.3,
    sigma_final_round_prob: 0.05,
    mean_ai_authored: 0.2,
    sigma_ai_authored: 0.05,
    rho_seniority: 0.1,
    rho_technical_depth: 0.1,
    rho_top_strengths: 0.2,
    rho_fit: 0.1,
    rho_final_round_probability: 0.1,
    rho_key_credential: 0.1,
    rho_missing_signal: 0.1,
    rho_ai_authored: 0.1,
    inter_modal_delta: 0.1,
    ats_legibility: 0.8,
    ats_fragility: 0.1,
    overall_llm_disagreement: 0.1,
    overall_parse_disagreement: 0.1,
    n_llms_responding: 4,
    n_parsers_responding: 3,
    ...overrides,
  }
}

test('aiLegibilityScore: result is integer in [0, 100]', () => {
  const f = makeFeatures()
  const s = aiLegibilityScore(f)
  assert.ok(Number.isInteger(s))
  assert.ok(s >= 0 && s <= 100)
})

test('aiLegibilityScore: high ats_legibility + low fragility + low σ + human-authored → high score', () => {
  const f = makeFeatures({
    ats_legibility: 1,
    ats_fragility: 0,
    sigma_seniority: 0,
    sigma_technical_depth: 0,
    sigma_fit: 0,
    mean_ai_authored: 0,
  })
  const s = aiLegibilityScore(f)
  assert.ok(s > 50, `expected >50, got ${s}`)
})

test('aiLegibilityScore: low ats_legibility + high fragility + high σ → lower score', () => {
  const high = aiLegibilityScore(
    makeFeatures({
      ats_legibility: 1,
      ats_fragility: 0,
      sigma_seniority: 0,
      sigma_technical_depth: 0,
      sigma_fit: 0,
    })
  )
  const low = aiLegibilityScore(
    makeFeatures({
      ats_legibility: 0.1,
      ats_fragility: 0.5,
      sigma_seniority: 5,
      sigma_technical_depth: 5,
      sigma_fit: 5,
    })
  )
  assert.ok(low < high)
})

test('aiLegibilityScore: handles null sigmas (some models failed scalar queries)', () => {
  const f = makeFeatures({
    sigma_seniority: null,
    sigma_technical_depth: null,
    sigma_fit: null,
  })
  const s = aiLegibilityScore(f)
  assert.ok(s >= 0 && s <= 100)
})

test('aiLegibilityScore: handles null mean_ai_authored (treats as neutral 0.5)', () => {
  const f = makeFeatures({ mean_ai_authored: null })
  const s = aiLegibilityScore(f)
  assert.ok(s >= 0 && s <= 100)
})

test('AI_LEGIBILITY_CAVEAT_COPY mentions M5', () => {
  assert.ok(AI_LEGIBILITY_CAVEAT_COPY.includes('M5'))
})
