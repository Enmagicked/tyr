// Acceptance criterion 5: cache fail-soft. When Upstash is unreachable
// (no env vars, or get/set throws), cacheGet returns null and cacheSet
// resolves silently — the graph still completes.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { cacheGet, cacheSet, _resetForTests, _injectClientForTests } from '../cache.ts'

beforeEach(() => {
  _resetForTests()
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
})

test('cache: missing env vars → cacheGet returns null', async () => {
  const v = await cacheGet<string>('any-key')
  assert.equal(v, null)
})

test('cache: missing env vars → cacheSet resolves silently', async () => {
  await cacheSet<string>('any-key', 'value')
  // No throw is the only assertion needed.
})

test('cache: injected client → cacheGet roundtrips', async () => {
  const store = new Map<string, unknown>()
  const fakeClient = {
    get: async <T>(key: string) => (store.has(key) ? (store.get(key) as T) : null),
    set: async (key: string, value: unknown) => {
      store.set(key, value)
      return 'OK'
    },
  }
  _injectClientForTests(fakeClient as never)

  await cacheSet('k1', { hello: 'world' })
  const v = await cacheGet<{ hello: string }>('k1')
  assert.deepEqual(v, { hello: 'world' })
})

test('cache: injected client whose get throws → cacheGet returns null (fail-soft)', async () => {
  const fakeClient = {
    get: async () => {
      throw new Error('upstream timeout')
    },
    set: async () => 'OK',
  }
  _injectClientForTests(fakeClient as never)

  const v = await cacheGet<string>('boom')
  assert.equal(v, null)
})

test('cache: injected client whose set throws → cacheSet resolves silently', async () => {
  const fakeClient = {
    get: async () => null,
    set: async () => {
      throw new Error('upstream timeout')
    },
  }
  _injectClientForTests(fakeClient as never)

  await cacheSet('boom', 'v')
  // No assertion needed — the test fails if the promise rejects.
})

test('cache: returns null on cache miss', async () => {
  const fakeClient = {
    get: async () => null,
    set: async () => 'OK',
  }
  _injectClientForTests(fakeClient as never)

  const v = await cacheGet<string>('missing')
  assert.equal(v, null)
})
