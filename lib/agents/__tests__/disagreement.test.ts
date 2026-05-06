// Tests acceptance criteria 5 (1 parser fail → 2 still computed) and 6
// (2 parsers fail → null overall_score, empty pair diffs).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  computeDisagreementFromCanonicals,
  pairwise,
} from '../disagreement.ts'
import type { CanonicalResume } from '@/types'

function emptyCanonical(): CanonicalResume {
  return { contact: { personal_urls: [] }, education: [], experience: [], skills: [] }
}

function basicCanonical(overrides: Partial<CanonicalResume> = {}): CanonicalResume {
  return {
    name: 'Jane Doe',
    contact: {
      email: 'jane@example.com',
      phone: '555-0100',
      linkedin_url: 'linkedin.com/in/jane',
      personal_urls: [],
    },
    education: [
      { school_canonical_id: 'yale', school_raw: 'Yale University', degree_normalized: 'BS' },
    ],
    experience: [
      {
        employer_canonical_id: 'google',
        employer_raw: 'Google',
        title_raw: 'SWE',
        bullets: ['Did X', 'Did Y'],
        bullet_count: 2,
        char_count: 10,
        start_iso: '2022-06',
        end_iso: '2024-08',
      },
    ],
    skills: [
      { name_canonical: 'Python', source: 'self' },
      { name_canonical: 'TypeScript', source: 'self' },
    ],
    ...overrides,
  }
}

test('disagreement: identical canonicals → overall_score ≈ 0', () => {
  const a = basicCanonical()
  const b = basicCanonical()
  const r = computeDisagreementFromCanonicals([
    { name: 'affinda', canonical: a },
    { name: 'openresume', canonical: b },
  ])
  assert.ok(r.overall_score !== null)
  assert.ok((r.overall_score as number) < 0.05, `expected near-zero overall, got ${r.overall_score}`)
  assert.equal(r.parser_pair_diffs.length, 1)
})

test('disagreement: 0 parsers → null overall, no pairs', () => {
  const r = computeDisagreementFromCanonicals([])
  assert.equal(r.overall_score, null)
  assert.deepEqual(r.parser_pair_diffs, [])
  assert.equal(r.parser_count, 0)
})

test('disagreement: 1 parser → null overall (acceptance criterion 6 edge)', () => {
  const r = computeDisagreementFromCanonicals([
    { name: 'affinda', canonical: basicCanonical() },
  ])
  assert.equal(r.overall_score, null)
  assert.deepEqual(r.parser_pair_diffs, [])
  assert.equal(r.parser_count, 1)
})

test('disagreement: 2 parsers → computed (acceptance criterion 5)', () => {
  const a = basicCanonical()
  const b = basicCanonical({
    skills: [{ name_canonical: 'Python', source: 'self' }],
  })
  const r = computeDisagreementFromCanonicals([
    { name: 'affinda', canonical: a },
    { name: 'naive', canonical: b },
  ])
  assert.equal(r.parser_count, 2)
  assert.equal(r.parser_pair_diffs.length, 1)
  assert.ok(r.overall_score !== null)
  assert.ok((r.overall_score as number) >= 0 && (r.overall_score as number) <= 1)
})

test('disagreement: 3 parsers → 3 pairs', () => {
  const r = computeDisagreementFromCanonicals([
    { name: 'a', canonical: basicCanonical() },
    { name: 'b', canonical: basicCanonical() },
    { name: 'c', canonical: basicCanonical() },
  ])
  assert.equal(r.parser_pair_diffs.length, 3)
})

test('disagreement: empty canonicals are handled', () => {
  const r = computeDisagreementFromCanonicals([
    { name: 'a', canonical: emptyCanonical() },
    { name: 'b', canonical: emptyCanonical() },
  ])
  assert.ok(r.overall_score !== null)
  // experience_alignment is 1 when both are empty (defined that way), but
  // field_disagreement is also 0. Overall should be very small.
  assert.ok((r.overall_score as number) <= 0.05)
})

test('pairwise: skill jaccard registers difference', () => {
  const a = basicCanonical()
  const b = basicCanonical({
    skills: [
      { name_canonical: 'Java', source: 'self' },
      { name_canonical: 'Go', source: 'self' },
    ],
  })
  const diff = pairwise(a, b)
  assert.equal(diff.field_disagreement.skills, 1, 'fully disjoint skill sets → 1')
})

test('pairwise: experience_alignment when employer matches across parsers', () => {
  const a = basicCanonical()
  const b = basicCanonical()
  const diff = pairwise(a, b)
  assert.equal(diff.experience_alignment, 1)
})

test('pairwise: experience_alignment with one parser missing employer', () => {
  const a = basicCanonical()
  const b = basicCanonical({ experience: [] })
  const diff = pairwise(a, b)
  assert.equal(diff.experience_alignment, 0)
})

test('overall_score is in [0, 1]', () => {
  const a = basicCanonical()
  const b = {
    ...emptyCanonical(),
    name: 'Completely Different',
    contact: { personal_urls: [], email: 'x@y.com' },
  }
  const r = computeDisagreementFromCanonicals([
    { name: 'a', canonical: a },
    { name: 'b', canonical: b },
  ])
  assert.ok(r.overall_score !== null)
  assert.ok((r.overall_score as number) >= 0)
  assert.ok((r.overall_score as number) <= 1)
})
