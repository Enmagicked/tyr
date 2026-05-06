// Together AI client (4th LLM judge — Llama-3.3-70B-Instruct-Turbo by default).
// Together exposes an OpenAI-compatible /v1/chat/completions endpoint, so we
// reuse the OpenAI SDK pointed at api.together.xyz.
//
// Like the other 3 clients, missing TOGETHER_API_KEY → throws on first call,
// which the graph catches as a node failure (perceive_llama is a soft dep,
// so the aggregate runs on whatever subset succeeded).

import OpenAI from 'openai'

const TOGETHER_BASE_URL = 'https://api.together.xyz/v1'
// See lib/llm/perceive.ts for the rename history.
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo'

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  const apiKey = process.env.TOGETHER_API_KEY
  if (!apiKey) throw new Error('TOGETHER_API_KEY is not set')
  _client = new OpenAI({ apiKey, baseURL: TOGETHER_BASE_URL })
  return _client
}

export interface TogetherCallOptions {
  model?: string
  temperature?: number
  responseFormat?: 'json_object' | 'text'
  maxTokens?: number
}

export async function callTogether(
  prompt: string,
  opts: TogetherCallOptions = {}
): Promise<{ text: string; latency_ms: number; model: string }> {
  const start = Date.now()
  const model = opts.model ?? DEFAULT_MODEL

  const r = await getClient().chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 600,
    ...(opts.responseFormat === 'json_object'
      ? { response_format: { type: 'json_object' } }
      : {}),
  })

  return {
    text: r.choices[0]?.message?.content ?? '',
    latency_ms: Date.now() - start,
    model,
  }
}

export const TOGETHER_DEFAULT_MODEL = DEFAULT_MODEL
