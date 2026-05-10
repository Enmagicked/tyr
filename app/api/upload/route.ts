import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractTextFromPDF } from '@/lib/extract-text'
import { getPostHogClient } from '@/lib/posthog-server'

// Single-handler try/catch so any unhandled throw becomes a JSON 500 with the
// actual error message, instead of Vercel's HTML FUNCTION_INVOCATION_FAILED
// page (which masks the cause and produces "Unexpected token '<'" on the client).
export async function POST(request: Request) {
  try {
    return await handleUpload(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[upload] unhandled error:', err)
    return NextResponse.json(
      { error: 'Upload handler failed', detail: message },
      { status: 500 }
    )
  }
}

async function handleUpload(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const targetRoleRaw = formData.get('target_role')
  const targetCompanyRaw = formData.get('target_company')
  const targetRole = typeof targetRoleRaw === 'string' ? targetRoleRaw.trim() : ''
  const targetCompany =
    typeof targetCompanyRaw === 'string' ? targetCompanyRaw.trim() : ''

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })
  }
  if (targetRole.length < 2 || targetRole.length > 80) {
    return NextResponse.json(
      { error: 'target_role must be 2-80 characters' },
      { status: 400 }
    )
  }
  // target_company is optional. Empty string is fine; if present, must satisfy
  // the same 2-80 bounds as role.
  if (targetCompany.length > 0 && (targetCompany.length < 2 || targetCompany.length > 80)) {
    return NextResponse.json(
      { error: 'target_company must be 2-80 characters when provided' },
      { status: 400 }
    )
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Extract text before uploading so we fail fast on bad PDFs.
  // Surface the underlying error so encrypted/scanned/malformed PDFs are
  // distinguishable in client and logs.
  let rawText: string
  try {
    rawText = await extractTextFromPDF(buffer, file.name)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[upload] PDF text extraction failed:', err)
    return NextResponse.json(
      {
        error: 'Could not extract text from PDF',
        detail: message,
        hint:
          'The PDF is most likely encrypted or malformed. Try a fresh export ' +
          'from Google Docs / Word.',
      },
      { status: 422 }
    )
  }
  if (!rawText || rawText.trim().length < 50) {
    // M6: extractTextFromPDF already attempted OCR fallback. Reaching here
    // means both pdf-parse AND Affinda OCR returned <50 chars — the file
    // is genuinely empty or unreadable.
    return NextResponse.json(
      {
        error: 'PDF contained no extractable text',
        detail: `Extracted only ${rawText?.trim().length ?? 0} characters after trying OCR.`,
        hint:
          'The PDF appears to be empty, blank, or contains only images that OCR ' +
          'could not read. Try re-exporting from Google Docs / Word as a fresh ' +
          'PDF, or paste your resume text directly.',
      },
      { status: 422 }
    )
  }

  const service = createServiceClient()
  const filePath = `${user.id}/${Date.now()}_${file.name}`

  const { error: storageError } = await service.storage
    .from('resumes')
    .upload(filePath, buffer, { contentType: 'application/pdf', upsert: false })

  if (storageError) {
    console.error('[upload] storage error:', storageError)
    return NextResponse.json({ error: 'Failed to store file' }, { status: 500 })
  }

  const { data: resume, error: dbError } = await service
    .from('resumes')
    .insert({
      candidate_id: user.id,
      file_path: filePath,
      file_name: file.name,
      raw_text: rawText,
      target_role: targetRole,
      target_company: targetCompany,
    })
    .select()
    .single()

  if (dbError || !resume) {
    console.error('[upload] db error:', dbError)
    return NextResponse.json({ error: 'Failed to save resume' }, { status: 500 })
  }

  const posthog = getPostHogClient()
  posthog.capture({
    distinctId: user.id,
    event: 'resume_upload_completed',
    properties: {
      resume_id: resume.id,
      target_role: targetRole,
      has_target_company: targetCompany.length > 0,
      file_size_bytes: file.size,
    },
  })
  await posthog.shutdown()

  return NextResponse.json({ resumeId: resume.id })
}
