// Embed module unit tests. We don't hit the network — real embedding calls are
// covered by the runtime acceptance pass. These cover the pure helpers and
// the cache-miss/no-key fail-soft path.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  cosineSimilarity,
  calibratedDispersion,
  embedCacheKey,
  embed,
  EMBEDDING_DIM,
  RANDOM_BASELINE_COSINE,
} from '../embed.ts'
import { _resetForTests } from '../cache.ts'

beforeEach(() => {
  _resetForTests()
  delete process.env.OPENAI_API_KEY
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
})

test('cosineSimilarity: identical vectors → 1', () => {
  const a = Float32Array.from([1, 2, 3])
  const b = Float32Array.from([1, 2, 3])
  assert.equal(cosineSimilarity(a, b), 1)
})

test('cosineSimilarity: orthogonal → 0', () => {
  const a = Float32Array.from([1, 0])
  const b = Float32Array.from([0, 1])
  assert.equal(cosineSimilarity(a, b), 0)
})

test('cosineSimilarity: opposite → -1', () => {
  const a = Float32Array.from([1, 0])
  const b = Float32Array.from([-1, 0])
  assert.equal(cosineSimilarity(a, b), -1)
})

test('cosineSimilarity: zero-norm → 0 (no NaN)', () => {
  const a = Float32Array.from([0, 0])
  const b = Float32Array.from([1, 1])
  assert.equal(cosineSimilarity(a, b), 0)
})

test('cosineSimilarity: mismatched length → 0', () => {
  const a = Float32Array.from([1, 2])
  const b = Float32Array.from([1, 2, 3])
  assert.equal(cosineSimilarity(a, b), 0)
})

test('calibratedDispersion: cosine = baseline → 1 (max dispersion ≡ random)', () => {
  // Per design comment: dispersion = (1 - cos) / (1 - baseline). At cos=baseline,
  // dispersion = (1 - baseline)/(1 - baseline) = 1.
  assert.equal(calibratedDispersion(RANDOM_BASELINE_COSINE), 1)
})

test('calibratedDispersion: cosine = 1 → 0 (identical)', () => {
  assert.equal(calibratedDispersion(1), 0)
})

test('calibratedDispersion: cosine = 0.7 → < 1 (more agreement than random)', () => {
  const d = calibratedDispersion(0.7)
  assert.ok(d >= 0 && d <= 1)
  assert.ok(d < 1)
})

test('calibratedDispersion: clamps to [0, 1] when cos > 1', () => {
  assert.equal(calibratedDispersion(1.2), 0)
})

test('embedCacheKey: stable per text, different across texts', () => {
  const a = embedCacheKey('hello world')
  const b = embedCacheKey('hello world')
  const c = embedCacheKey('different')
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.ok(a.startsWith('apeds:v1:embed:'))
})

test('embed: empty text → null', async () => {
  const v = await embed('')
  assert.equal(v, null)
})

test('embed: missing OPENAI_API_KEY → null (fail-soft, no throw)', async () => {
  const v = await embed('some text')
  assert.equal(v, null)
})

test('EMBEDDING_DIM is 1536 (text-embedding-3-small)', () => {
  assert.equal(EMBEDDING_DIM, 1536)
})
