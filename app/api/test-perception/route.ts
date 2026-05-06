import { NextResponse } from 'next/server'
import { runOpenAI } from '@/lib/llm/openai'
import { runAnthropic } from '@/lib/llm/anthropic'
import { generatePerceptionReport } from '@/lib/llm/analyze'
import { PROMPT_KEYS } from '@/lib/llm/prompts'
import { LLMResponse } from '@/types'

// No auth, no DB — smoke test only. Remove before production.
export async function POST(request: Request) {
  const { resumeText } = await request.json() as { resumeText?: string }

  if (!resumeText || resumeText.trim().length < 50) {
    return NextResponse.json({ error: 'Provide at least 50 characters of resume text' }, { status: 400 })
  }

  const tasks = PROMPT_KEYS.flatMap((key) => [
    runOpenAI(resumeText, key),
    runAnthropic(resumeText, key),
  ])

  const settled = await Promise.allSettled(tasks)

  const responses: LLMResponse[] = settled
    .map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      const model = i % 2 === 0 ? 'gpt-4o' : 'claude-sonnet-4-6'
      const key = PROMPT_KEYS[Math.floor(i / 2)]
      console.error(`[test-perception] ${model}/${key} failed:`, r.reason)
      return null
    })
    .filter((r): r is LLMResponse => r !== null)

  const report = generatePerceptionReport('test', responses)

  return NextResponse.json({ responses, report })
}
