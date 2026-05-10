// Tests for the JSON repair fallback (M3 risk #1: Llama is less strict in
// JSON mode), validation/coercion, and cache key stability.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  repairAndParseJson,
  validateAndCoerce,
  perceiveCacheKey,
  truncateResume,
} from '../perceive.ts'
import { PERCEPTION_QUERIES } from '../prompts.ts'

test('repairAndParseJson: clean object → parsed', () => {
  const r = repairAndParseJson('{"scalar": 7, "reasoning": "ok"}')
  assert.deepEqual(r, { scalar: 7, reasoning: 'ok' })
})

test('repairAndParseJson: wrapped in markdown fence → parsed', () => {
  const r = repairAndParseJson('```json\n{"scalar": 5, "reasoning": "x"}\n```')
  assert.deepEqual(r, { scalar: 5, reasoning: 'x' })
})

test('repairAndParseJson: bare ``` fence → parsed', () => {
  const r = repairAndParseJson('```\n{"text": "foo", "reasoning": "y"}\n```')
  assert.deepEqual(r, { text: 'foo', reasoning: 'y' })
})

test('repairAndParseJson: prose preamble + JSON object → extracted', () => {
  const r = repairAndParseJson(
    'Sure, here is my answer:\n{"scalar": 8, "reasoning": "test"}\nLet me know if you need more.'
  )
  assert.deepEqual(r, { scalar: 8, reasoning: 'test' })
})

test('repairAndParseJson: unparseable garbage → null', () => {
  const r = repairAndParseJson('this is not json at all 🤷')
  assert.equal(r, null)
})

test('repairAndParseJson: empty string → null', () => {
  assert.equal(repairAndParseJson(''), null)
})

test('repairAndParseJson: top-level array (not object) → null (we want the object shape)', () => {
  // The current implementation treats arrays as not-objects since our schemas
  // wrap lists in {"list": [...]}. A bare array fails parse; the regex
  // fallback only matches objects.
  assert.equal(repairAndParseJson('[1, 2, 3]'), null)
})

test('validateAndCoerce: scalar query, valid number → passed through', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.seniority, {
    scalar: 7,
    reasoning: 'mid-senior',
  })
  assert.equal(r.scalar, 7)
  assert.equal(r.reasoning, 'mid-senior')
})

test('validateAndCoerce: scalar query, string number → coerced', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.seniority, {
    scalar: '6',
    reasoning: 'r',
  })
  assert.equal(r.scalar, 6)
})

test('validateAndCoerce: scalar query, out-of-range → clamped', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.seniority, {
    scalar: 99,
    reasoning: 'r',
  })
  assert.equal(r.scalar, 10) // range [1,10] → clamps to 10
})

test('validateAndCoerce: scalar 0-1 query, out-of-range → clamped', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.ai_authored, {
    scalar: 1.5,
    reasoning: 'r',
  })
  assert.equal(r.scalar, 1)
})

test('validateAndCoerce: scalar query, non-numeric → undefined', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.seniority, {
    scalar: 'not a number',
    reasoning: 'r',
  })
  assert.equal(r.scalar, undefined)
})

test('validateAndCoerce: list query, valid array → trimmed to listLength', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.top_strengths, {
    list: ['a', 'b', 'c', 'd', 'e'],
    reasoning: 'r',
  })
  assert.deepEqual(r.list, ['a', 'b', 'c'])
})

test('validateAndCoerce: list query, mixed types → strings only', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.top_strengths, {
    list: ['a', 5, null, 'b'],
    reasoning: 'r',
  })
  assert.deepEqual(r.list, ['a', 'b'])
})

test('validateAndCoerce: text query, plain string → passed through', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.key_credential, {
    text: 'Yale, B.S. CS',
    reasoning: 'r',
  })
  assert.equal(r.text, 'Yale, B.S. CS')
})

test('validateAndCoerce: missing reasoning → empty string', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.seniority, { scalar: 5 })
  assert.equal(r.reasoning, '')
})

test('validateAndCoerce: parsed=null → empty response (still has key)', () => {
  const r = validateAndCoerce(PERCEPTION_QUERIES.seniority, null)
  assert.equal(r.key, 'seniority')
  assert.equal(r.scalar, undefined)
  assert.equal(r.reasoning, '')
})

test('perceiveCacheKey: stable for same inputs', () => {
  const a = perceiveCacheKey('gpt-4o', 'seniority', 'resume body')
  const b = perceiveCacheKey('gpt-4o', 'seniority', 'resume body')
  assert.equal(a, b)
})

test('perceiveCacheKey: differs across model / query / text', () => {
  const base = perceiveCacheKey('gpt-4o', 'seniority', 'r1')
  assert.notEqual(base, perceiveCacheKey('claude-sonnet-4-6', 'seniority', 'r1'))
  assert.notEqual(base, perceiveCacheKey('gpt-4o', 'fit', 'r1'))
  assert.notEqual(base, perceiveCacheKey('gpt-4o', 'seniority', 'r2'))
})

test('perceiveCacheKey: namespaced under apeds:v4 (M8.B bumped from v3)', () => {
  const k = perceiveCacheKey('llama-3.3-70b', 'ai_authored', 'x')
  assert.ok(k.startsWith('apeds:v4:llama-3.3-70b:ai_authored:'))
})

test('M8.B perceiveCacheKey: same resume + different target_jd → different keys', () => {
  const a = perceiveCacheKey('gpt-4o', 'fit', 'r', {
    target_role: 'SWE',
    target_company: 'Google',
    target_jd: 'Build distributed systems with Kafka',
  })
  const b = perceiveCacheKey('gpt-4o', 'fit', 'r', {
    target_role: 'SWE',
    target_company: 'Google',
    target_jd: 'Build React frontends',
  })
  assert.notEqual(a, b, 'JD context must affect the cache key')
})

test('M8.B perceiveCacheKey: omitting JD vs empty JD vs whitespace JD → same key', () => {
  const omitted = perceiveCacheKey('gpt-4o', 'fit', 'r', { target_role: 'SWE' })
  const empty = perceiveCacheKey('gpt-4o', 'fit', 'r', { target_role: 'SWE', target_jd: '' })
  const ws = perceiveCacheKey('gpt-4o', 'fit', 'r', { target_role: 'SWE', target_jd: '   ' })
  assert.equal(omitted, empty)
  assert.equal(omitted, ws)
})

test('perceiveCacheKey: same resume + different target_role → different keys (M4 acceptance #11)', () => {
  const a = perceiveCacheKey('gpt-4o', 'fit', 'resume body', {
    target_role: 'SWE',
    target_company: 'Google',
  })
  const b = perceiveCacheKey('gpt-4o', 'fit', 'resume body', {
    target_role: 'IB Analyst',
    target_company: 'Google',
  })
  assert.notEqual(a, b)
})

test('perceiveCacheKey: same resume + different target_company → different keys', () => {
  const a = perceiveCacheKey('gpt-4o', 'fit', 'resume body', {
    target_role: 'SWE',
    target_company: 'Google',
  })
  const b = perceiveCacheKey('gpt-4o', 'fit', 'resume body', {
    target_role: 'SWE',
    target_company: 'JPMorgan',
  })
  assert.notEqual(a, b)
})

test('perceiveCacheKey: stable under target whitespace (trim)', () => {
  const a = perceiveCacheKey('gpt-4o', 'fit', 'r', {
    target_role: '  SWE  ',
    target_company: 'Google',
  })
  const b = perceiveCacheKey('gpt-4o', 'fit', 'r', {
    target_role: 'SWE',
    target_company: 'Google',
  })
  assert.equal(a, b)
})

// ---------------------------------------------------------------------------
// M8 length cap
// ---------------------------------------------------------------------------

test('M8 truncateResume: under 20K chars → unchanged', () => {
  const text = 'a'.repeat(15_000)
  const r = truncateResume(text)
  assert.equal(r.truncated, false)
  assert.equal(r.text, text)
  assert.equal(r.text.length, 15_000)
})

test('M8 truncateResume: at the 20K boundary → unchanged', () => {
  const text = 'a'.repeat(20_000)
  const r = truncateResume(text)
  assert.equal(r.truncated, false)
  assert.equal(r.text.length, 20_000)
})

test('M8 truncateResume: over 20K → truncated, preserves head + tail with marker', () => {
  // Use distinguishable head + middle + tail so we can verify the truncation
  // strategy keeps the right parts.
  const head = 'HEAD_'.repeat(2_000)        // 10000 chars
  const middle = 'MID_'.repeat(2_500)       // 10000 chars (will be dropped)
  const tail = 'TAIL_'.repeat(1_980)        // 9900 chars
  const original = head + middle + tail     // 29900 chars
  assert.ok(original.length > 20_000, 'fixture must exceed cap to test truncation')

  const r = truncateResume(original)
  assert.equal(r.truncated, true)
  assert.ok(r.text.startsWith('HEAD_HEAD_'), 'head must be preserved at start')
  assert.ok(r.text.endsWith('TAIL_TAIL_'), 'tail must be preserved at end')
  assert.ok(r.text.includes('truncated'), 'must include the truncation marker')
  assert.ok(!r.text.includes('MID_'), 'middle section must be dropped')
})

test('M8 truncateResume: empty string → unchanged, not truncated', () => {
  const r = truncateResume('')
  assert.equal(r.truncated, false)
  assert.equal(r.text, '')
})

test('M8 perceiveCacheKey: cache key uses TRUNCATED text — same cap-overflow resume yields same key', () => {
  // Two long resumes that differ only past the truncation boundary should
  // produce the same cache key when truncated identically. Construct so the
  // truncated form is identical: same head + same tail, different middle.
  const head = 'HEAD_'.repeat(2_000)
  const tail = 'TAIL_'.repeat(1_980)
  const a = head + 'A_'.repeat(5_000) + tail
  const b = head + 'B_'.repeat(5_000) + tail
  // Truncate first (simulate what perceive() does), then key off truncated:
  const truncA = truncateResume(a).text
  const truncB = truncateResume(b).text
  assert.equal(truncA, truncB, 'precondition: truncated forms identical')
  assert.equal(
    perceiveCacheKey('gpt-4o', 'seniority', truncA),
    perceiveCacheKey('gpt-4o', 'seniority', truncB),
    'cache key must be stable for identically-truncated resumes'
  )
})
