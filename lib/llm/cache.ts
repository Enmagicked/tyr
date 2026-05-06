// Upstash-backed cache for LLM completions and embeddings.
//
// Fail-soft contract: if Upstash credentials are missing or any call throws,
// log once and proceed. Callers must treat both `cacheGet` (returns null on
// any failure) and `cacheSet` (resolves silently) as best-effort. The graph
// completes either way.
//
// Cache key namespace lives in lib/llm/perceive.ts and lib/llm/embed.ts so that
// bumping prompt templates (lib/llm/prompts.ts) propagates through their
// templated key strings.

import { Redis } from '@upstash/redis'

let _client: Redis | null | undefined  // undefined = not yet checked, null = unavailable
let _warned = false

function getClient(): Redis | null {
  if (_client !== undefined) return _client

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    _client = null
    return null
  }

  try {
    _client = new Redis({ url, token })
    return _client
  } catch (err) {
    if (!_warned) {
      console.warn('[llm/cache] Upstash unavailable, running without cache:', err)
      _warned = true
    }
    _client = null
    return null
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getClient()
  if (!client) return null

  try {
    const value = await client.get<T>(key)
    return value ?? null
  } catch (err) {
    if (!_warned) {
      console.warn('[llm/cache] get failed, falling through:', err)
      _warned = true
    }
    return null
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 60 * 60 * 24 * 30  // 30 days default
): Promise<void> {
  const client = getClient()
  if (!client) return

  try {
    await client.set(key, value, { ex: ttlSeconds })
  } catch (err) {
    if (!_warned) {
      console.warn('[llm/cache] set failed, dropping:', err)
      _warned = true
    }
  }
}

// Test-only hooks. Production code should never reach these.
export function _resetForTests(): void {
  _client = undefined
  _warned = false
}

export function _injectClientForTests(client: Redis | null): void {
  _client = client
}
