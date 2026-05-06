import { LLMResponse, ModelName, PromptKey } from '@/types'
import { PROMPT_KEYS, PROMPTS } from './prompts'
import { runOpenAI } from './openai'
import { runAnthropic } from './anthropic'
import { runGemini } from './gemini'
import { callTogether } from './together'

// Legacy adapter for the M1 freeform-prompt path. The graph runs the M3
// structured invoker (lib/llm/perceive.ts) instead.
async function runLlama(text: string, key: PromptKey): Promise<LLMResponse> {
  const start = Date.now()
  const r = await callTogether(PROMPTS[key](text))
  return {
    model_name: 'llama-3.1-70b',
    prompt_key: key,
    response_text: r.text,
    latency_ms: Date.now() - start,
  }
}

const RUNNERS: Record<ModelName, (text: string, key: PromptKey) => Promise<LLMResponse>> = {
  'gpt-4o': runOpenAI,
  'claude-sonnet-4-6': runAnthropic,
  'gemini-1.5-pro': runGemini,
  'llama-3.1-70b': runLlama,
}

export const MODELS: ModelName[] = [
  'gpt-4o',
  'claude-sonnet-4-6',
  'gemini-1.5-pro',
  'llama-3.1-70b',
]

// Runs all 6 prompts across all 3 models (18 calls) in parallel.
export async function runAllModels(resumeText: string): Promise<LLMResponse[]> {
  const tasks = MODELS.flatMap((model) =>
    PROMPT_KEYS.map((key) => RUNNERS[model](resumeText, key))
  )

  const settled = await Promise.allSettled(tasks)

  return settled
    .map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      const model = MODELS[Math.floor(i / PROMPT_KEYS.length)]
      const key = PROMPT_KEYS[i % PROMPT_KEYS.length]
      console.error(`[llm] ${model}/${key} failed:`, result.reason)
      return null
    })
    .filter((r): r is LLMResponse => r !== null)
}
