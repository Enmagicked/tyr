// Tests for the LLM-side disagreement scorer (M3 acceptance criteria 7-10).
// Covers:
//   - 0/1/4 LLM responding cases
//   - σ_j (sigma_scalar) on scalar queries with ≥2 models
//   - ρ_j (rho_reasoning) on reasoning embeddings
//   - inter-modal δ when both ATS and LLM seniority available
//   - APEDS feature vector assembly + ats_legibility / ats_fragility math

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  computePerceptionDisagreement,
  buildApedsFeatures,
  ALL_LLMS_FAILED_ISSUE,
} from '../perception-disagreement.ts'
import type { PerceiveResult } from '../../llm/perceive.ts'
import type { ModelName, CanonicalResume, ParseResult } from '@/types'

function makeEmbedding(seed: number): Float32Array {
  // Deterministic 8-dim mock embedding — perpendicular vectors give cos≈0,
  // identical seeds give cos=1. Real embeddings are 1536-dim; the math is
  // identical and we don't want to allocate 1536 floats per test row.
  const v = new Float32Array(8)
  v[seed % 8] = 1
  return v
}

function makeResult(args: {
  model: ModelName
  query: PerceiveResult['query']
  scalar?: number
  text?: string
  list?: string[]
  reasoning?: string
  embedSeed?: number
}): PerceiveResult {
  return {
    model: args.model,
    query: args.query,
    response: {
      key: args.query,
      scalar: args.scalar,
      text: args.text,
      list: args.list,
      reasoning: args.reasoning ?? 'because',
    },
    reasoning_embedding: args.embedSeed !== undefined ? makeEmbedding(args.embedSeed) : null,
    cache_hit: false,
    latency_ms: 100,
  }
}

test('perception-disagreement: 0 LLMs → null (caller emits high-severity issue)', () => {
  const r = computePerceptionDisagreement([])
  assert.equal(r, null)
})

test('perception-disagreement: 1 LLM → σ and ρ are null, n_responding=1', () => {
  const results: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 7, embedSeed: 0 }),
  ]
  const r = computePerceptionDisagreement(results)
  assert.ok(r)
  assert.equal(r.per_query.seniority.mean_scalar, 7)
  assert.equal(r.per_query.seniority.sigma_scalar, null)
  assert.equal(r.per_query.seniority.rho_reasoning, null)
  assert.equal(r.per_query.seniority.n_responding, 1)
})

test('perception-disagreement: 4 LLMs all answer seniority → σ computed', () => {
  const results: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 7, embedSeed: 0 }),
    makeResult({ model: 'claude-sonnet-4-6', query: 'seniority', scalar: 7, embedSeed: 0 }),
    makeResult({ model: 'gemini-2.5-flash', query: 'seniority', scalar: 8, embedSeed: 0 }),
    makeResult({ model: 'llama-3.1-70b', query: 'seniority', scalar: 8, embedSeed: 0 }),
  ]
  const r = computePerceptionDisagreement(results)
  assert.ok(r)
  assert.equal(r.per_query.seniority.n_responding, 4)
  assert.equal(r.per_query.seniority.mean_scalar, 7.5)
  // population stdev of [7,7,8,8] = 0.5
  assert.equal(r.per_query.seniority.sigma_scalar, 0.5)
})

test('perception-disagreement: 4 LLMs identical reasoning embeds → ρ ≈ 0', () => {
  const results: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'top_strengths', list: ['a'], embedSeed: 3 }),
    makeResult({ model: 'claude-sonnet-4-6', query: 'top_strengths', list: ['a'], embedSeed: 3 }),
    makeResult({ model: 'gemini-2.5-flash', query: 'top_strengths', list: ['a'], embedSeed: 3 }),
  ]
  const r = computePerceptionDisagreement(results)
  assert.ok(r)
  // Identical embeddings → cos=1 → calibratedDispersion(1) = 0
  assert.equal(r.per_query.top_strengths.rho_reasoning, 0)
})

test('perception-disagreement: orthogonal reasoning embeds → ρ > 0', () => {
  const results: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'fit', scalar: 6, embedSeed: 0 }),
    makeResult({ model: 'claude-sonnet-4-6', query: 'fit', scalar: 6, embedSeed: 1 }),
    makeResult({ model: 'gemini-2.5-flash', query: 'fit', scalar: 6, embedSeed: 2 }),
  ]
  const r = computePerceptionDisagreement(results)
  assert.ok(r)
  // Orthogonal mock vectors → cos=0 → calibratedDispersion = (1-0)/(1-0.4) = 1.667 → clamped to 1
  assert.ok((r.per_query.fit.rho_reasoning ?? 0) > 0)
})

test('perception-disagreement: 2 LLMs answer one query, 4 answer another (mixed n_responding)', () => {
  const results: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 7, embedSeed: 0 }),
    makeResult({ model: 'claude-sonnet-4-6', query: 'seniority', scalar: 8, embedSeed: 1 }),
    makeResult({ model: 'gpt-4o', query: 'fit', scalar: 5, embedSeed: 0 }),
    makeResult({ model: 'claude-sonnet-4-6', query: 'fit', scalar: 7, embedSeed: 1 }),
    makeResult({ model: 'gemini-2.5-flash', query: 'fit', scalar: 6, embedSeed: 2 }),
    makeResult({ model: 'llama-3.1-70b', query: 'fit', scalar: 4, embedSeed: 3 }),
  ]
  const r = computePerceptionDisagreement(results)
  assert.ok(r)
  assert.equal(r.per_query.seniority.n_responding, 2)
  assert.equal(r.per_query.fit.n_responding, 4)
  // Untouched queries → n=0
  assert.equal(r.per_query.ai_authored.n_responding, 0)
})

test('perception-disagreement: overall_disagreement ∈ [0, 1]', () => {
  const results: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 1, embedSeed: 0 }),
    makeResult({ model: 'claude-sonnet-4-6', query: 'seniority', scalar: 10, embedSeed: 1 }),
  ]
  const r = computePerceptionDisagreement(results)
  assert.ok(r)
  assert.ok(r.overall_disagreement >= 0)
  assert.ok(r.overall_disagreement <= 1)
})

test('perception-disagreement: inter_modal_delta computed when both ATS level and LLM seniority present', () => {
  const llmResults: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 8, embedSeed: 0 }),
    makeResult({ model: 'claude-sonnet-4-6', query: 'seniority', scalar: 8, embedSeed: 0 }),
  ]
  const parseResults: ParseResult[] = [
    {
      parser_name: 'affinda',
      raw_output: {},
      structured_data: { skills: [], experience: [], education: [], certifications: [], languages: [] },
      canonical_data: {
        contact: { personal_urls: [] },
        education: [],
        experience: [
          {
            employer_canonical_id: 'google',
            employer_raw: 'Google',
            title_raw: 'Senior Engineer',
            level_inferred: 'senior',
            bullets: [],
            bullet_count: 0,
            char_count: 0,
          },
        ],
        skills: [],
      },
      normalization_issues: [],
      parse_score: 1,
      issues: [],
    },
  ]
  const r = computePerceptionDisagreement(llmResults, parseResults)
  assert.ok(r)
  // LLM mean = 8, ATS senior=8, |8-8|/9 = 0
  assert.equal(r.inter_modal_delta, 0)
})

test('perception-disagreement: inter_modal_delta normalized to [0,1]', () => {
  const llmResults: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 1, embedSeed: 0 }),
  ]
  const parseResults: ParseResult[] = [
    {
      parser_name: 'affinda',
      raw_output: {},
      structured_data: { skills: [], experience: [], education: [], certifications: [], languages: [] },
      canonical_data: {
        contact: { personal_urls: [] },
        education: [],
        experience: [
          {
            employer_canonical_id: 'x',
            employer_raw: 'X',
            title_raw: 'CEO',
            level_inferred: 'exec',
            bullets: [],
            bullet_count: 0,
            char_count: 0,
          },
        ],
        skills: [],
      },
      normalization_issues: [],
      parse_score: 1,
      issues: [],
    },
  ]
  const r = computePerceptionDisagreement(llmResults, parseResults)
  assert.ok(r)
  // |1 - 10| / 9 = 1
  assert.equal(r.inter_modal_delta, 1)
})

test('perception-disagreement: parse_resume failed → inter_modal_delta is null', () => {
  const llmResults: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 7, embedSeed: 0 }),
  ]
  const r = computePerceptionDisagreement(llmResults, null)
  assert.ok(r)
  assert.equal(r.inter_modal_delta, null)
})

test('perception-disagreement: ATS has no level_inferred → inter_modal_delta is null', () => {
  const llmResults: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 7, embedSeed: 0 }),
  ]
  const parseResults: ParseResult[] = [
    {
      parser_name: 'affinda',
      raw_output: {},
      structured_data: { skills: [], experience: [], education: [], certifications: [], languages: [] },
      canonical_data: {
        contact: { personal_urls: [] },
        education: [],
        experience: [],
        skills: [],
      },
      normalization_issues: [],
      parse_score: 1,
      issues: [],
    },
  ]
  const r = computePerceptionDisagreement(llmResults, parseResults)
  assert.ok(r)
  assert.equal(r.inter_modal_delta, null)
})

test('perception-disagreement: models_responding lists unique models', () => {
  const results: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 7 }),
    makeResult({ model: 'gpt-4o', query: 'fit', scalar: 5 }),
    makeResult({ model: 'claude-sonnet-4-6', query: 'seniority', scalar: 6 }),
  ]
  const r = computePerceptionDisagreement(results)
  assert.ok(r)
  assert.deepEqual([...r.models_responding].sort(), ['claude-sonnet-4-6', 'gpt-4o'])
})

test('buildApedsFeatures: returns null when perception is null', () => {
  const r = buildApedsFeatures({ perception: null, parseResults: [], parseDisagreementOverall: null })
  assert.equal(r, null)
})

test('buildApedsFeatures: ats_legibility = mean fill rate across parsers', () => {
  const llmResults: PerceiveResult[] = [
    makeResult({ model: 'gpt-4o', query: 'seniority', scalar: 7 }),
  ]
  const perception = computePerceptionDisagreement(llmResults)
  // canonical with all fields filled → fillRate = 9/9 = 1
  const fullCanonical: CanonicalResume = {
    name: 'X',
    contact: { email: 'a', phone: 'b', linkedin_url: 'c', github_url: 'd', personal_urls: ['e'] },
    education: [{ school_canonical_id: 'y', school_raw: 'Y' }],
    experience: [
      { employer_canonical_id: 'z', employer_raw: 'Z', title_raw: 't', bullets: [], bullet_count: 0, char_count: 0 },
    ],
    skills: [{ name_canonical: 'Python', source: 'self' }],
  }
  const emptyCanonical: CanonicalResume = {
    contact: { personal_urls: [] }, education: [], experience: [], skills: [],
  }
  const parseResults: ParseResult[] = [
    {
      parser_name: 'affinda', raw_output: {},
      structured_data: { skills: [], experience: [], education: [], certifications: [], languages: [] },
      canonical_data: fullCanonical, normalization_issues: [], parse_score: 1, issues: [],
    },
    {
      parser_name: 'naive', raw_output: {},
      structured_data: { skills: [], experience: [], education: [], certifications: [], languages: [] },
      canonical_data: emptyCanonical, normalization_issues: [], parse_score: 1, issues: [],
    },
  ]
  const f = buildApedsFeatures({ perception, parseResults, parseDisagreementOverall: 0.3 })
  assert.ok(f)
  // Mean of [1.0, 0.0] = 0.5
  assert.equal(f.ats_legibility, 0.5)
  // Variance of [1.0, 0.0] (population) = 0.25
  assert.equal(f.ats_fragility, 0.25)
  assert.equal(f.n_parsers_responding, 2)
  assert.equal(f.overall_parse_disagreement, 0.3)
})

test('ALL_LLMS_FAILED_ISSUE has severity high and field=apeds_features', () => {
  assert.equal(ALL_LLMS_FAILED_ISSUE.severity, 'high')
  assert.equal(ALL_LLMS_FAILED_ISSUE.field, 'apeds_features')
})
