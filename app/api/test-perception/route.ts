import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runOpenAI } from '@/lib/llm/openai'
import { runAnthropic } from '@/lib/llm/anthropic'
import { generatePerceptionReport } from '@/lib/llm/analyze'
import { PROMPT_KEYS } from '@/lib/llm/prompts'
import { LLMResponse } from '@/types'

// M1-era smoke test endpoint. Calls 12 LLMs (6 prompts × 2 providers) per
// request — auth-gating is non-negotiable in prod or anonymous users could
// burn the LLM key. Companion UI lives at /test (also gated via proxy.ts).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
