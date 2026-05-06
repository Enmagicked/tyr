import { Context } from '@/lib/graph'
import { createServiceClient } from '@/lib/supabase/service'

export interface LoadResumeResult {
  raw_text: string
  file_buffer: Buffer
  file_name: string
  candidate_id: string
  target_role?: string | null
  target_company?: string | null
}

export async function loadResume(ctx: Context): Promise<LoadResumeResult> {
  // Text-only mode: pass raw_text directly in context to skip Supabase (useful for testing)
  if (ctx.raw_text) {
    return {
      raw_text: ctx.raw_text as string,
      file_buffer: Buffer.alloc(0),
      file_name: 'inline.txt',
      candidate_id: (ctx.candidate_id as string) ?? 'anonymous',
      target_role: (ctx.target_role as string | undefined) ?? null,
      target_company: (ctx.target_company as string | undefined) ?? null,
    }
  }

  const resumeId = ctx.resume_id as string
  if (!resumeId) throw new Error('Context must have resume_id or raw_text')

  const supabase = createServiceClient()

  const { data: resume, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', resumeId)
    .single()

  if (error || !resume) throw new Error(`Resume ${resumeId} not found: ${error?.message}`)

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('resumes')
    .download(resume.file_path)

  if (downloadError || !fileData) {
    throw new Error(`Failed to download file: ${downloadError?.message}`)
  }

  return {
    raw_text: resume.raw_text ?? '',
    file_buffer: Buffer.from(await fileData.arrayBuffer()),
    file_name: resume.file_name,
    candidate_id: resume.candidate_id,
    target_role: resume.target_role ?? null,
    target_company: resume.target_company ?? null,
  }
}
