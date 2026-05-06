// Acceptance criterion 3: all 8 queries (q1-q8) defined with stable keys.
// Plus the lockfile drift check that prevents silent prompt edits from
// poisoning the Upstash cache (M3 risk #5).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  PERCEPTION_QUERIES,
  PERCEPTION_QUERY_KEYS,
  hashPromptTemplates,
} from '../prompts.ts'

const here = dirname(fileURLToPath(import.meta.url))
const lockPath = join(here, '..', 'prompts.lock.json')

test('PERCEPTION_QUERY_KEYS contains all 8 queries q1-q8', () => {
  const expected = [
    'seniority',
    'technical_depth',
    'top_strengths',
    'fit',
    'final_round_probability',
    'key_credential',
    'missing_signal',
    'ai_authored',
  ]
  assert.deepEqual([...PERCEPTION_QUERY_KEYS].sort(), [...expected].sort())
  assert.equal(PERCEPTION_QUERY_KEYS.length, 8)
})

test('every query spec has the required fields', () => {
  for (const key of PERCEPTION_QUERY_KEYS) {
    const spec = PERCEPTION_QUERIES[key]
    assert.equal(spec.key, key, `${key}: spec.key must equal map key`)
    assert.ok(['scalar', 'list', 'text'].includes(spec.shape), `${key}: shape valid`)
    assert.equal(typeof spec.prompt, 'function', `${key}: prompt callable`)
    if (spec.shape === 'scalar') {
      assert.ok(spec.scalarRange, `${key}: scalar query needs scalarRange`)
      assert.equal(spec.scalarRange?.length, 2)
    }
    if (spec.shape === 'list') {
      assert.ok(typeof spec.listLength === 'number', `${key}: list query needs listLength`)
    }
  }
})

test('every prompt mentions JSON output and includes the resume', () => {
  const sentinel = '__TEST_RESUME_BODY__'
  for (const key of PERCEPTION_QUERY_KEYS) {
    const rendered = PERCEPTION_QUERIES[key].prompt(sentinel)
    assert.ok(rendered.includes('JSON'), `${key}: prompt must mention JSON`)
    assert.ok(rendered.includes(sentinel), `${key}: prompt must inline the resume text`)
  }
})

test('scalar queries declare a sane range', () => {
  for (const key of PERCEPTION_QUERY_KEYS) {
    const spec = PERCEPTION_QUERIES[key]
    if (spec.shape !== 'scalar') continue
    const [lo, hi] = spec.scalarRange!
    assert.ok(lo < hi, `${key}: scalar range lo<hi`)
  }
})

test('lockfile drift check: live hashes match prompts.lock.json', () => {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const live = hashPromptTemplates()
  for (const key of PERCEPTION_QUERY_KEYS) {
    assert.equal(
      live[key],
      lock.hashes[key],
      `Prompt template for "${key}" changed without bumping the cache version. ` +
        `Update prompts.lock.json AND bump apeds:v1 in lib/llm/cache.ts.`
    )
  }
})

test('lockfile contains a hash for every query (no orphaned/missing entries)', () => {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const lockKeys = Object.keys(lock.hashes).sort()
  const queryKeys = [...PERCEPTION_QUERY_KEYS].sort()
  assert.deepEqual(lockKeys, queryKeys)
})
