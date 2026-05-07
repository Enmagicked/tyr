// Tests for the M5 bullet-level heuristic metrics. All pure functions —
// no DOM/network. Covers each detector in isolation + edge cases that
// previously bit the implementation (single-word bullets, leading bullet
// glyphs, all-caps openers, embedded numbers vs quantified outcomes).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  hasQuantification,
  startsWithActionVerb,
  buzzwordCount,
  charLengthStats,
  bulletMetrics,
  ACTION_VERBS,
  BUZZWORDS,
} from '../bullet-metrics.ts'

// ---------------------------------------------------------------------------
// hasQuantification
// ---------------------------------------------------------------------------

test('quantification: percentage form', () => {
  assert.equal(hasQuantification('Increased revenue 47%'), true)
  assert.equal(hasQuantification('Increased revenue by 47 %'), true)
})

test('quantification: dollar form', () => {
  assert.equal(hasQuantification('Saved $1.2M annually'), true)
  assert.equal(hasQuantification('Closed deals worth $250K'), true)
})

test('quantification: multiplier form', () => {
  assert.equal(hasQuantification('Scaled traffic 10x'), true)
  assert.equal(hasQuantification('Reduced latency 3x'), true)
})

test('quantification: "by N" form with verb', () => {
  assert.equal(hasQuantification('Reduced cost by 32%'), true)
  assert.equal(hasQuantification('Improved load time by 1200ms'), true)
})

test('quantification: large number alone', () => {
  // "100 users" — standalone 2+ digit number reads as a quantified outcome
  assert.equal(hasQuantification('Onboarded 100 users in week one'), true)
})

test('quantification: single-digit standalone is NOT counted', () => {
  // "Led 3 engineers" — single digit, ambiguous, deliberately not matched
  // by the standalone-digit heuristic. It IS matched by the verb-+-digit
  // pattern though, so we use a single-digit case where no verb precedes.
  assert.equal(hasQuantification('Did 3'), false)
})

test('quantification: empty / whitespace bullet → false', () => {
  assert.equal(hasQuantification(''), false)
  assert.equal(hasQuantification('   '), false)
})

test('quantification: prose without numbers → false', () => {
  assert.equal(hasQuantification('Built a great team and shipped product'), false)
  assert.equal(
    hasQuantification('Worked closely with cross-functional partners on initiatives'),
    false
  )
})

// ---------------------------------------------------------------------------
// startsWithActionVerb
// ---------------------------------------------------------------------------

test('action verb: trivial start', () => {
  assert.equal(startsWithActionVerb('Built a backend service'), true)
  assert.equal(startsWithActionVerb('Led a team of 5'), true)
  assert.equal(startsWithActionVerb('Reduced cost by 32%'), true)
})

test('action verb: case-insensitive', () => {
  assert.equal(startsWithActionVerb('LAUNCHED a new product'), true)
  assert.equal(startsWithActionVerb('shipped weekly releases'), true)
})

test('action verb: leading bullet glyphs are stripped', () => {
  assert.equal(startsWithActionVerb('• Built a backend'), true)
  assert.equal(startsWithActionVerb('- Led a team'), true)
  assert.equal(startsWithActionVerb('1. Designed the schema'), true)
})

test('action verb: weak openers → false', () => {
  assert.equal(startsWithActionVerb('Was responsible for the dashboard'), false)
  assert.equal(startsWithActionVerb('Helped the team out'), false)
  assert.equal(startsWithActionVerb('Worked on a project'), false)
})

test('action verb: empty / whitespace → false', () => {
  assert.equal(startsWithActionVerb(''), false)
  assert.equal(startsWithActionVerb('   '), false)
})

test('action verb: mid-bullet verb does NOT count', () => {
  // "Was thinking about building" — verb in the middle, opener is weak
  assert.equal(startsWithActionVerb('Was thinking about building a tool'), false)
})

// ---------------------------------------------------------------------------
// buzzwordCount
// ---------------------------------------------------------------------------

test('buzzword: single match', () => {
  assert.equal(buzzwordCount('Recognized as a team player'), 1)
})

test('buzzword: multiple in one bullet', () => {
  assert.equal(
    buzzwordCount('Results-driven, detail-oriented self-starter'),
    3
  )
})

test('buzzword: case-insensitive', () => {
  // Matches: "thought leader", "leverage" (substring of "leverages"), "synergy"
  assert.equal(buzzwordCount('THOUGHT LEADER who leverages synergy'), 3)
})

test('buzzword: clean bullet → 0', () => {
  assert.equal(
    buzzwordCount('Built a Next.js dashboard that ingested 5M events/day'),
    0
  )
})

test('buzzword: empty → 0', () => {
  assert.equal(buzzwordCount(''), 0)
})

// ---------------------------------------------------------------------------
// charLengthStats
// ---------------------------------------------------------------------------

test('char stats: empty array → all zero', () => {
  assert.deepEqual(charLengthStats([]), { min: 0, max: 0, mean: 0, p50: 0 })
})

test('char stats: single bullet', () => {
  const s = charLengthStats(['Built it'])
  assert.equal(s.min, 8)
  assert.equal(s.max, 8)
  assert.equal(s.mean, 8)
  assert.equal(s.p50, 8)
})

test('char stats: odd count → median is the middle element', () => {
  const s = charLengthStats(['aa', 'aaaa', 'aaaaaa']) // lengths 2, 4, 6
  assert.equal(s.min, 2)
  assert.equal(s.max, 6)
  assert.equal(s.mean, 4)
  assert.equal(s.p50, 4)
})

test('char stats: even count → median is average of two middle', () => {
  const s = charLengthStats(['a', 'aa', 'aaa', 'aaaa']) // 1,2,3,4
  assert.equal(s.p50, 2.5)
})

// ---------------------------------------------------------------------------
// bulletMetrics — top-level aggregator
// ---------------------------------------------------------------------------

test('bulletMetrics: realistic mid-level SWE bullet set', () => {
  const bullets = [
    'Built a real-time analytics pipeline ingesting 5M events/day',
    'Led a team of 4 engineers to ship a new onboarding flow',
    'Reduced p99 API latency by 320ms (47% improvement)',
    'Was responsible for the legacy monolith',
    'Detail-oriented team player driving cross-functional initiatives',
  ]
  const m = bulletMetrics(bullets)
  // Quantified: 1, 3 (47%, 320ms), 2 (4 engineers — caught by "by N"? actually no, "team of 4" matches \b\d{2,}\b? no, single digit), 1 (5M)
  // Let's count manually:
  //   bullet 0: "5M events/day" — `\b\d+(\.\d+)?\s*(million|billion|thousand|m|b|k|mm)\b/i` matches "5M" ✓
  //   bullet 1: "team of 4" — single digit, no match
  //   bullet 2: "by 320ms" matches "by \d", and "47%" matches "%", and "320ms" matches \b\d{2,}\b ✓
  //   bullet 3: no number
  //   bullet 4: no number
  assert.equal(m.quantification, 2)
  // Action verb starts: Built, Led, Reduced — 3 of 5
  assert.equal(m.action_verb, 3)
  // Buzzwords: bullet 4 has "detail-oriented", "team player", "cross-functional" — 3
  assert.equal(m.buzzword, 3)
  assert.equal(m.char_stats.min, bullets[3].length) // "Was responsible..."
})

test('bulletMetrics: empty array', () => {
  const m = bulletMetrics([])
  assert.equal(m.quantification, 0)
  assert.equal(m.action_verb, 0)
  assert.equal(m.buzzword, 0)
  assert.deepEqual(m.char_stats, { min: 0, max: 0, mean: 0, p50: 0 })
})

test('bulletMetrics: filters whitespace-only bullets', () => {
  const m = bulletMetrics(['', '   ', 'Built it'])
  assert.equal(m.action_verb, 1)
  assert.equal(m.char_stats.min, 8) // only "Built it" counted
  assert.equal(m.char_stats.max, 8)
})

// ---------------------------------------------------------------------------
// List sanity — exported lists must be non-trivially sized
// ---------------------------------------------------------------------------

test('ACTION_VERBS list has plausible coverage (≥40 verbs)', () => {
  assert.ok(ACTION_VERBS.length >= 40)
  assert.ok(ACTION_VERBS.includes('built'))
  assert.ok(ACTION_VERBS.includes('led'))
  assert.ok(ACTION_VERBS.includes('reduced'))
})

test('BUZZWORDS list has plausible coverage (≥20 phrases)', () => {
  assert.ok(BUZZWORDS.length >= 20)
  assert.ok(BUZZWORDS.includes('team player'))
  assert.ok(BUZZWORDS.includes('results-driven'))
})
