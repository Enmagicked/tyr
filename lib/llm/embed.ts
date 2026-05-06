// OpenAI text-embedding-3-small wrapper. 1536-dim float vector per input.
// Cached by sha256(text) under the apeds:v1:embed:* namespace.
//
// Used by perception-disagreement to compute ρ_j (cosine dispersion of
// reasoning text across LLMs). Failure mode: if OpenAI is misconfigured or
// the call throws, return null — perception-disagreement treats null
// embeddings as "no ρ signal for this query" and still emits σ_j.

import OpenAI from 'openai'
import { createHash } from 'node:crypto'
import { cacheGet, cacheSet } from './cache.ts'

export const EMBEDDING_DIM = 1536
export const EMBEDDING_MODEL = 'text-embedding-3-small'

let _client: OpenAI | null = null
function getClient(): OpenAI | null {
  if (_client) return _client
  if (!process.env.OPENAI_API_KEY) return null
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _client
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function embedCacheKey(text: string): string {
  return `apeds:v1:embed:${hashText(text)}`
}

export async function embed(text: string): Promise<Float32Array | null> {
  if (!text) return null

  const key = embedCacheKey(text)
  const cached = await cacheGet<number[]>(key)
  if (cached && Array.isArray(cached) && cached.length === EMBEDDING_DIM) {
    return Float32Array.from(cached)
  }

  const client = getClient()
  if (!client) return null

  try {
    const r = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    })
    const vec = r.data[0]?.embedding
    if (!vec || vec.length !== EMBEDDING_DIM) return null

    // Stored as plain number[] in cache — Upstash REST is JSON-only.
    await cacheSet(key, vec)
    return Float32Array.from(vec)
  } catch (err) {
    console.warn('[llm/embed] embedding call failed:', err)
    return null
  }
}

// Cosine similarity ∈ [-1, 1]. Used by perception-disagreement to compute
// 1 - mean(cos(a, b)) across all reasoning-embedding pairs per query.
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// text-embedding-3-small embeddings of random/unrelated text are not orthogonal
// — they cluster around ~0.4 cosine. Subtract this baseline so ρ ≈ 0 means
// "indistinguishable from random." Re-estimate quarterly per M3 plan §risk 4.
export const RANDOM_BASELINE_COSINE = 0.4

export function calibratedDispersion(meanCosine: number): number {
  // 1 - cosine, then rescale [baseline..1] → [0..1]. Clip to [0,1].
  const raw = 1 - meanCosine
  const baselineDispersion = 1 - RANDOM_BASELINE_COSINE
  const calibrated = raw / baselineDispersion
  if (Number.isNaN(calibrated)) return 0
  return Math.max(0, Math.min(1, calibrated))
}
