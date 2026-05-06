import OpenAI from 'openai'
import { LLMResponse, PromptKey } from '@/types'
import { PROMPTS } from './prompts'

let _openai: OpenAI | null = null
function getClient() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export async function runOpenAI(resumeText: string, promptKey: PromptKey): Promise<LLMResponse> {
  const start = Date.now()

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: PROMPTS[promptKey](resumeText) }],
    temperature: 0.3,
    max_tokens: 600,
  })

  return {
    model_name: 'gpt-4o',
    prompt_key: promptKey,
    response_text: response.choices[0].message.content ?? '',
    latency_ms: Date.now() - start,
  }
}
