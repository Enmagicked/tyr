// Unit tests for the M7 (KNOWN_ISSUES 2.1) bullet-extraction fallback in
// pickSourceParser. The full analyzeBullets() graph node is integration-
// covered by the prod smoke test; here we focus on the picker because that's
// where the fallback rule lives.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pickSourceParser } from '../analyze-bullets.ts'
import type { ParseResult, ParserName, CanonicalExperience } from '@/types'

function exp(employer: string, bullets: string[]): CanonicalExperience {
  return {
    employer_canonical_id: employer,
    employer_raw: employer,
    title_raw: 'Engineer',
    bullets,
    bullet_count: bullets.length,
    char_count: bullets.reduce((a, b) => a + b.length, 0),
  }
}

function pr(
  parser_name: ParserName,
  parse_score: number,
  experiences: CanonicalExperience[]
): ParseResult {
  return {
    parser_name,
    raw_output: null,
    structured_data: {
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      languages: [],
    },
    canonical_data: {
      contact: { personal_urls: [] },
      education: [],
      experience: experiences,
      skills: [],
    },
    normalization_issues: [],
    parse_score,
    issues: [],
  }
}

test('pickSourceParser: empty input → null', () => {
  assert.equal(pickSourceParser([]), null)
})

test('pickSourceParser: single result returned regardless of bullet count', () => {
  const only = pr('naive', 0.5, [exp('Stripe', [])])
  assert.equal(pickSourceParser([only]), only)
})

test('pickSourceParser: highest-score parser with bullets wins', () => {
  const top = pr('openresume', 0.9, [exp('Stripe', ['shipped X', 'fixed Y'])])
  const mid = pr('naive', 0.7, [exp('Stripe', ['a', 'b', 'c'])])
  const low = pr('affinda', 0.0, [exp('Stripe', ['z'])])
  assert.equal(pickSourceParser([low, mid, top])?.parser_name, 'openresume')
})

test('M7 fallback: top-scored parser has 0 bullets → fall through to next-highest WITH bullets', () => {
  const topNoBullets = pr('openresume', 0.9, [exp('Stripe', [])])
  const midWithBullets = pr('naive', 0.7, [exp('Stripe', ['shipped X'])])
  const low = pr('affinda', 0.0, [])
  const picked = pickSourceParser([topNoBullets, midWithBullets, low])
  assert.equal(picked?.parser_name, 'naive')
})

test('M7 fallback: top two have 0 bullets, third has 1 → picks third', () => {
  const top = pr('openresume', 0.9, [exp('Stripe', [])])
  const mid = pr('naive', 0.7, [])
  const low = pr('affinda', 0.5, [exp('Stripe', ['shipped X'])])
  assert.equal(pickSourceParser([top, mid, low])?.parser_name, 'affinda')
})

test('M7 fallback: ALL parsers have 0 bullets → degenerate fallback to highest-scored', () => {
  const top = pr('openresume', 0.9, [exp('Stripe', [])])
  const mid = pr('naive', 0.7, [])
  const low = pr('affinda', 0.5, [])
  // All three have 0 bullets — picker still returns top so source_parser is
  // attributed correctly downstream (synthesize_summary's noBullets branch
  // fires with the right name).
  assert.equal(pickSourceParser([low, mid, top])?.parser_name, 'openresume')
})

test('pickSourceParser: tie on score → alphabetical tiebreak (when both have bullets)', () => {
  const a = pr('affinda', 0.7, [exp('Stripe', ['x'])])
  const o = pr('openresume', 0.7, [exp('Stripe', ['y'])])
  // affinda < naive < openresume alphabetically; affinda wins the tie
  assert.equal(pickSourceParser([o, a])?.parser_name, 'affinda')
})

test('M7 fallback: bullets aggregated across multiple experiences', () => {
  // Top parser has 2 experiences but BOTH empty bullets
  const top = pr('openresume', 0.9, [exp('Stripe', []), exp('Google', [])])
  // Lower parser has bullets in only the second experience
  const mid = pr('naive', 0.7, [exp('Stripe', []), exp('Google', ['shipped X'])])
  assert.equal(pickSourceParser([top, mid])?.parser_name, 'naive')
})
