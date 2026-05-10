// Shared LLM invoker: one entry point per (model, query, resume) tuple.
//
// Flow:
//   1. Truncate resume text if > MAX_RESUME_CHARS (M8 length cap).
//   2. Compute cache key from (model, query, truncatedText, role, company).
//   3. cacheGet → on hit, return cached PerceptionResponse + fresh embedding.
//   4. Dispatch to the appropriate model client via provider-native
//      structured-output mode (M8: OpenAI strict json_schema, Anthropic
//      tool use, Gemini responseSchema, Together json_object + repair).
//   5. Parse JSON; on failure, run JSON-repair fallback.
//   6. Validate + clamp scalar to spec range.
//   7. embed(reasoning) for ρ_j calculation.
//   8. cacheSet the response. Return result.
//
// M8 cache bump: apeds:v2 → apeds:v3. Reason: prompt template added system
// message, reasoning-first JSON schema, <resume_text> delimiters. All v2
// entries are now stale-keyed.

import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI, type ResponseSchema } from '@google/generative-ai'

import type { ModelName } from '@/types'
import {
  PERCEPTION_QUERIES,
  SYSTEM_PROMPT,
  getJsonSchema,
  type PerceptionQueryKey,
  type PerceptionQuerySpec,
  type PerceptionQueryContext,
  type JsonSchema,
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
// M8: length cap. Resume text is truncated to head + tail with a marker
// before being sent to any provider. The cache key uses the truncated text
// so the cache key matches what was actually scored.
//
// 20K char cap ≈ 4 pages of dense prose. Enough for 99% of resumes.
// On overflow we keep first 10K + last 9.9K so the model still sees both
// the most-recent role (typically resume top) and the education/early-career
// section (typically resume bottom).
// ---------------------------------------------------------------------------

const MAX_RESUME_CHARS = 20_000
const TRUNCATION_HEAD = 10_000
const TRUNCATION_TAIL = 9_900

export function truncateResume(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_RESUME_CHARS) return { text, truncated: false }
  const head = text.slice(0, TRUNCATION_HEAD)
  const tail = text.slice(-TRUNCATION_TAIL)
  return {
    text: `${head}\n\n[...resume truncated for length; see raw_text in DB for full content...]\n\n${tail}`,
    truncated: true,
  }
}

// ---------------------------------------------------------------------------
// Model dispatch — provider-native structured output.
// ---------------------------------------------------------------------------

interface DispatchArgs {
  system: string
  user: string
  schemaName: string
  schema: JsonSchema
}

let _openai: OpenAI | null = null
let _anthropic: Anthropic | null = null
let _gemini: GoogleGenerativeAI | null = null
let _together: OpenAI | null = null

const TOGETHER_BASE_URL = 'https://api.together.xyz/v1'
// Together rotates serverless availability. M4 deploy timeline:
//   1. Original: meta-llama/Llama-3.1-70B-Instruct-Turbo → 404 (renamed)
//   2. Renamed: meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo → 400 non-serverless
//   3. Current: meta-llama/Llama-3.3-70B-Instruct-Turbo → serverless ✅
const LLAMA_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo'

async function callOpenAI(args: DispatchArgs): Promise<{ text: string; latency_ms: number }> {
  const start = Date.now()
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const r = await _openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
    temperature: 0,
    max_tokens: 600,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: args.schemaName,
        strict: true,
        schema: args.schema,
      },
    },
  })
  return {
    text: r.choices[0]?.message?.content ?? '',
    latency_ms: Date.now() - start,
  }
}

async function callAnthropic(args: DispatchArgs): Promise<{ text: string; latency_ms: number }> {
  const start = Date.now()
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const r = await _anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    temperature: 0,
    system: args.system,
    tools: [
      {
        name: args.schemaName,
        // input_schema accepts the same JSON Schema shape as OpenAI strict
        // mode. JsonSchema's index signature makes this assignment safe.
        input_schema: args.schema,
      },
    ],
    tool_choice: { type: 'tool', name: args.schemaName },
    messages: [{ role: 'user', content: args.user }],
  })
  // Forced tool_use: the response is the tool input as a structured object.
  // Stringify so the downstream JSON parser path stays uniform across providers.
  const toolUse = r.content.find((b) => b.type === 'tool_use')
  const text =
    toolUse && toolUse.type === 'tool_use'
      ? JSON.stringify(toolUse.input)
      : ''
  return { text, latency_ms: Date.now() - start }
}

async function callGemini(args: DispatchArgs): Promise<{ text: string; latency_ms: number }> {
  const start = Date.now()
  const key = process.env.GOOGLE_AI_API_KEY
  if (!key) throw new Error('GOOGLE_AI_API_KEY is not set')
  if (!_gemini) _gemini = new GoogleGenerativeAI(key)
  const model = _gemini.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: args.system,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 600,
      responseMimeType: 'application/json',
      // Gemini accepts JSON Schema via responseSchema. Its TS type is the
      // ResponseSchema enum-based shape; at runtime the SDK accepts plain
      // string type values ('string', 'number', etc.). Cast through unknown
      // so the type checker doesn't insist on the enum form.
      responseSchema: args.schema as unknown as ResponseSchema,
    },
  })
  const r = await model.generateContent(args.user)
  return { text: r.response.text(), latency_ms: Date.now() - start }
}

async function callLlama(args: DispatchArgs): Promise<{ text: string; latency_ms: number }> {
  const start = Date.now()
  if (!_together) {
    const apiKey = process.env.TOGETHER_API_KEY
    if (!apiKey) throw new Error('TOGETHER_API_KEY is not set')
    _together = new OpenAI({ apiKey, baseURL: TOGETHER_BASE_URL })
  }
  // Together's strict json_schema support varies by model. For Llama 3.3 we
  // stick with json_object mode + repairAndParseJson — same approach as
  // pre-M8. The schema is conveyed inline in the user message via the
  // "Return: {...}" stanza (see prompts.ts).
  const r = await _together.chat.completions.create({
    model: LLAMA_MODEL,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
    temperature: 0,
    max_tokens: 600,
    response_format: { type: 'json_object' },
  })
  return {
    text: r.choices[0]?.message?.content ?? '',
    latency_ms: Date.now() - start,
  }
}

const DISPATCH: Record<ModelName, (args: DispatchArgs) => Promise<{ text: string; latency_ms: number }>> = {
  'gpt-4o': callOpenAI,
  'claude-sonnet-4-6': callAnthropic,
  'gemini-2.5-flash': callGemini,
  'llama-3.3-70b': callLlama,
}

// ---------------------------------------------------------------------------
// JSON parsing with repair fallbacks (Llama is less strict than the others).
// ---------------------------------------------------------------------------

export function repairAndParseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null

  const direct = tryParse(raw.trim())
  if (direct) return direct

  const fenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const fencedParsed = tryParse(fenced)
  if (fencedParsed) return fencedParsed

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

// M4: cache namespace v1 → v2 (q4 fit got target_role/target_company).
// M8: v2 → v3 (system prompt + reasoning-first JSON + <resume_text>
// delimiters across all 8 queries — every v2 entry is now stale-keyed).
//
// Cache key uses the TRUNCATED resume text so the key matches what was
// actually scored. Same target context → same cache key.
export function perceiveCacheKey(
  model: ModelName,
  queryKey: PerceptionQueryKey,
  truncatedResumeText: string,
  context?: PerceptionQueryContext
): string {
  const role = context?.target_role?.trim() ?? ''
  const company = context?.target_company?.trim() ?? ''
  const h = hash(`${model}␟${queryKey}␟${truncatedResumeText}␟${role}␟${company}`).slice(0, 32)
  return `apeds:v3:${model}:${queryKey}:${h}`
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
  const { text: truncatedText, truncated } = truncateResume(resumeText)
  if (truncated) {
    // One log per (model, query, resume); slightly noisy but flags the case
    // for Sentry/log analysis. Future improvement: dedupe per-resume.
    console.warn(`[perceive] truncated resume for ${model}/${queryKey} (${resumeText.length} → ${truncatedText.length} chars)`)
  }
  const cacheKey = perceiveCacheKey(model, queryKey, truncatedText, context)

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

  const userMessage = spec.prompt(truncatedText, context)
  const { text, latency_ms } = await dispatch({
    system: SYSTEM_PROMPT,
    user: userMessage,
    schemaName: `perception_${queryKey}`,
    schema: getJsonSchema(queryKey),
  })
  const parsed = repairAndParseJson(text)
  const response = validateAndCoerce(spec, parsed)

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
