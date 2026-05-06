// Shared LLM invoker: one entry point per (model, query, resume) tuple.
//
// Flow:
//   1. Compute cache key sha256(model + query + resumeText).
//   2. cacheGet → on hit, return cached PerceptionResponse.
//   3. Dispatch to the appropriate model client.
//   4. Parse JSON; on failure, run JSON-repair fallback (regex extract → reasoning-only).
//   5. Validate against the query's expected shape.
//   6. embed(reasoning) for ρ_j calculation; embedding stored in its own cache.
//   7. cacheSet the response (sans embedding — embeddings cached separately).
//   8. Return { response, embedding, cache_hit, latency_ms }.

import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

import type { ModelName } from '@/types'
import {
  PERCEPTION_QUERIES,
  type PerceptionQueryKey,
  type PerceptionQuerySpec,
  type PerceptionQueryContext,
} from './prompts.ts'
import { cacheGet, cacheSet } from './cache.ts'
import { embed } from './embed.ts'

export interface PerceptionResponse {
  key: PerceptionQueryKey
  scalar?: number
  list?: string[]
  text?: string
  reasoning: string
}

export interface PerceiveResult {
  model: ModelName
  query: PerceptionQueryKey
  response: PerceptionResponse
  reasoning_embedding: Float32Array | null
  cache_hit: boolean
  latency_ms: number
}

// ---------------------------------------------------------------------------
// Model dispatch — thin per-model adapters that return raw JSON text. Each
// model gets its own client cached at module scope.
// ---------------------------------------------------------------------------

let _openai: OpenAI | null = null
let _anthropic: Anthropic | null = null
let _gemini: GoogleGenerativeAI | null = null
let _together: OpenAI | null = null

const TOGETHER_BASE_URL = 'https://api.together.xyz/v1'
const LLAMA_MODEL = 'meta-llama/Llama-3.1-70B-Instruct-Turbo'

async function callOpenAI(prompt: string): Promise<{ text: string; latency_ms: number }> {
  const start = Date.now()
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const r = await _openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 600,
    response_format: { type: 'json_object' },
  })
  return {
    text: r.choices[0]?.message?.content ?? '',
    latency_ms: Date.now() - start,
  }
}

async function callAnthropic(prompt: string): Promise<{ text: string; latency_ms: number }> {
  const start = Date.now()
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const r = await _anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = r.content[0]?.type === 'text' ? r.content[0].text : ''
  return { text, latency_ms: Date.now() - start }
}

async function callGemini(prompt: string): Promise<{ text: string; latency_ms: number }> {
  const start = Date.now()
  const key = process.env.GOOGLE_AI_API_KEY
  if (!key) throw new Error('GOOGLE_AI_API_KEY is not set')
  if (!_gemini) _gemini = new GoogleGenerativeAI(key)
  const model = _gemini.getGenerativeModel({
    model: 'gemini-1.5-pro',
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 600,
      responseMimeType: 'application/json',
    },
  })
  const r = await model.generateContent(prompt)
  return { text: r.response.text(), latency_ms: Date.now() - start }
}

async function callLlama(prompt: string): Promise<{ text: string; latency_ms: number }> {
  const start = Date.now()
  if (!_together) {
    const apiKey = process.env.TOGETHER_API_KEY
    if (!apiKey) throw new Error('TOGETHER_API_KEY is not set')
    _together = new OpenAI({ apiKey, baseURL: TOGETHER_BASE_URL })
  }
  const r = await _together.chat.completions.create({
    model: LLAMA_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 600,
    response_format: { type: 'json_object' },
  })
  return {
    text: r.choices[0]?.message?.content ?? '',
    latency_ms: Date.now() - start,
  }
}

const DISPATCH: Record<ModelName, (p: string) => Promise<{ text: string; latency_ms: number }>> = {
  'gpt-4o': callOpenAI,
  'claude-sonnet-4-6': callAnthropic,
  'gemini-1.5-pro': callGemini,
  'llama-3.1-70b': callLlama,
}

// ---------------------------------------------------------------------------
// JSON parsing with repair fallbacks (M3 risk #1: Llama is less strict than
// GPT-4o in JSON mode).
// ---------------------------------------------------------------------------

export function repairAndParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null

  // Attempt 1: direct parse.
  const direct = tryParse(raw.trim())
  if (direct) return direct

  // Attempt 2: strip markdown fences.
  const fenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const fencedParsed = tryParse(fenced)
  if (fencedParsed) return fencedParsed

  // Attempt 3: regex-extract the first JSON object substring.
  const match = raw.match(/\{[\s\S]*\}/)
  if (match) {
    const extracted = tryParse(match[0])
    if (extracted) return extracted
  }

  return null
}

function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Validation against the query's expected shape.
// ---------------------------------------------------------------------------

export function validateAndCoerce(
  spec: PerceptionQuerySpec,
  parsed: Record<string, unknown> | null
): PerceptionResponse {
  const reasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning : ''

  if (!parsed) {
    // Last-ditch: return reasoning-only with the relevant slot null/undefined.
    return { key: spec.key, reasoning: '' }
  }

  if (spec.shape === 'scalar') {
    let scalar: number | undefined
    const raw = parsed.scalar
    if (typeof raw === 'number' && !Number.isNaN(raw)) {
      scalar = clampToRange(raw, spec.scalarRange!)
    } else if (typeof raw === 'string') {
      const n = Number(raw)
      if (!Number.isNaN(n)) scalar = clampToRange(n, spec.scalarRange!)
    }
    return { key: spec.key, scalar, reasoning }
  }

  if (spec.shape === 'list') {
    const raw = parsed.list
    let list: string[] | undefined
    if (Array.isArray(raw)) {
      list = raw.filter((x): x is string => typeof x === 'string').slice(0, spec.listLength ?? raw.length)
    }
    return { key: spec.key, list, reasoning }
  }

  // text shape
  const raw = parsed.text
  const text = typeof raw === 'string' ? raw : undefined
  return { key: spec.key, text, reasoning }
}

function clampToRange(n: number, [lo, hi]: [number, number]): number {
  return Math.max(lo, Math.min(hi, n))
}

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

// M4: cache namespace bumped v1 → v2 because q4 (fit) prompt template gained
// target_role/target_company. Old v1 entries are now stale-keyed and inert.
// Key incorporates target context so the same resume run with different
// (role, company) values misses cache and produces distinct q4 responses
// — that's the M4 acceptance criterion 11 invariant.
export function perceiveCacheKey(
  model: ModelName,
  queryKey: PerceptionQueryKey,
  resumeText: string,
  context?: PerceptionQueryContext
): string {
  const role = context?.target_role?.trim() ?? ''
  const company = context?.target_company?.trim() ?? ''
  const h = hash(`${model}␟${queryKey}␟${resumeText}␟${role}␟${company}`).slice(0, 32)
  return `apeds:v2:${model}:${queryKey}:${h}`
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function perceive(
  model: ModelName,
  queryKey: PerceptionQueryKey,
  resumeText: string,
  context?: PerceptionQueryContext
): Promise<PerceiveResult> {
  const spec = PERCEPTION_QUERIES[queryKey]
  const cacheKey = perceiveCacheKey(model, queryKey, resumeText, context)

  const cached = await cacheGet<PerceptionResponse>(cacheKey)
  if (cached) {
    const embedding = await embed(cached.reasoning)
    return {
      model,
      query: queryKey,
      response: cached,
      reasoning_embedding: embedding,
      cache_hit: true,
      latency_ms: 0,
    }
  }

  const dispatch = DISPATCH[model]
  if (!dispatch) throw new Error(`No dispatch for model ${model}`)

  const { text, latency_ms } = await dispatch(spec.prompt(resumeText, context))
  const parsed = repairAndParseJson(text)
  const response = validateAndCoerce(spec, parsed)

  // Best-effort cache write — fail-soft inside cacheSet.
  await cacheSet(cacheKey, response)

  const embedding = await embed(response.reasoning)

  return {
    model,
    query: queryKey,
    response,
    reasoning_embedding: embedding,
    cache_hit: false,
    latency_ms,
  }
}

// All 8 queries for one model; returns whichever succeeded (fail-soft per query).
export async function perceiveAllQueries(
  model: ModelName,
  resumeText: string,
  context?: PerceptionQueryContext
): Promise<PerceiveResult[]> {
  const queryKeys = Object.keys(PERCEPTION_QUERIES) as PerceptionQueryKey[]
  const settled = await Promise.allSettled(
    queryKeys.map((k) => perceive(model, k, resumeText, context))
  )
  return settled
    .filter((r): r is PromiseFulfilledResult<PerceiveResult> => r.status === 'fulfilled')
    .map((r) => r.value)
}
