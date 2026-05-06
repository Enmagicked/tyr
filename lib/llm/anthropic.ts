import Anthropic from '@anthropic-ai/sdk'
import { LLMResponse, PromptKey } from '@/types'
import { PROMPTS } from './prompts'

let _anthropic: Anthropic | null = null
function getClient() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

export async function runAnthropic(resumeText: string, promptKey: PromptKey): Promise<LLMResponse> {
  const start = Date.now()

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    temperature: 0.3,
    messages: [{ role: 'user', content: PROMPTS[promptKey](resumeText) }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  return {
    model_name: 'claude-sonnet-4-6',
    prompt_key: promptKey,
    response_text: text,
    latency_ms: Date.now() - start,
  }
}
