import { GoogleGenerativeAI } from '@google/generative-ai'
import { LLMResponse, PromptKey } from '@/types'
import { PROMPTS } from './prompts'

function getClient() {
  const key = process.env.GOOGLE_AI_API_KEY
  if (!key) throw new Error('GOOGLE_AI_API_KEY is not set')
  return new GoogleGenerativeAI(key)
}

export async function runGemini(resumeText: string, promptKey: PromptKey): Promise<LLMResponse> {
  const start = Date.now()

  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
  })

  const result = await model.generateContent(PROMPTS[promptKey](resumeText))
  const text = result.response.text()

  return {
    model_name: 'gemini-2.5-flash',
    prompt_key: promptKey,
    response_text: text,
    latency_ms: Date.now() - start,
  }
}
