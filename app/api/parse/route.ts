import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runAllParsers } from '@/lib/parsers'

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
    .select('*')
    .eq('id', resumeId)
    .eq('candidate_id', user.id)
    .single()

  if (error || !resume) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
  }

  const { data: fileData, error: downloadError } = await service.storage
    .from('resumes')
    .download(resume.file_path)

  if (downloadError || !fileData) {
    console.error('[parse] download error:', downloadError)
    return NextResponse.json({ error: 'Failed to download resume file' }, { status: 500 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const results = await runAllParsers(buffer, resume.file_name, resume.raw_text ?? '')

  const rows = results.map((r) => ({
    resume_id: resumeId,
    parser_name: r.parser_name,
    raw_output: r.raw_output,
    structured_data: r.structured_data,
    parse_score: r.parse_score,
    issues: r.issues,
  }))

  const { error: insertError } = await service.from('parse_results').insert(rows)
  if (insertError) {
    console.error('[parse] insert error:', insertError)
  }

  return NextResponse.json({ results })
}
