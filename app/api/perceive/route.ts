import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runAllModels } from '@/lib/llm'
import { generatePerceptionReport } from '@/lib/llm/analyze'
import { PROMPTS } from '@/lib/llm/prompts'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { resumeId } = await request.json() as { resumeId?: string }
  if (!resumeId) {
    return NextResponse.json({ error: 'resumeId required' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: resume, error } = await service
    .from('resumes')
    .select('raw_text, candidate_id')
    .eq('id', resumeId)
    .single()

  if (error || !resume || resume.candidate_id !== user.id) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
  }

  if (!resume.raw_text) {
    return NextResponse.json({ error: 'Resume has no extracted text' }, { status: 422 })
  }

  const responses = await runAllModels(resume.raw_text)

  const rows = responses.map((r) => ({
    resume_id: resumeId,
    model_name: r.model_name,
    prompt_key: r.prompt_key,
    prompt_text: PROMPTS[r.prompt_key](resume.raw_text!).slice(0, 2000),
    response_text: r.response_text,
    latency_ms: r.latency_ms,
  }))

  const { error: insertError } = await service.from('llm_responses').insert(rows)
  if (insertError) {
    console.error('[perceive] insert llm_responses error:', insertError)
  }

  const report = generatePerceptionReport(resumeId, responses)

  const { error: reportError } = await service
    .from('perception_reports')
    .upsert({ resume_id: resumeId, report })

  if (reportError) {
    console.error('[perceive] insert perception_reports error:', reportError)
  }

  return NextResponse.json({ report })
}
