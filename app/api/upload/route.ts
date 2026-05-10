import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractTextFromPDF } from '@/lib/extract-text'
import { ocrDocument } from '@/lib/ocr'
import { ingestUrl, UrlIngestError } from '@/lib/ingest/url'
import { getPostHogClient } from '@/lib/posthog-server'

// M8.C: three input kinds converge on the same resume row.
//   pdf   — original flow: PDF upload, pdf-parse → OCR fallback.
//   image — image upload (PNG/JPG/WebP), OCR via lib/ocr.ts.
//   url   — URL submitted, server-side fetch + Readability via lib/ingest/url.ts.
//
// All three populate raw_text + file_path. For URL inputs we synthesize a
// .txt file in storage (cheap, keeps file_path NOT NULL invariant). For
// image inputs we store the original bytes so future re-analysis can OCR
// at higher fidelity if needed.

type InputKind = 'pdf' | 'url' | 'image'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
const MIN_RAW_TEXT_CHARS = 50

interface IngestResult {
  raw_text: string
  storage_buffer: Buffer
  storage_mime: string
  file_name: string
  source_url?: string
}

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

  // Common target fields (apply to every input kind)
  const targetRoleRaw = formData.get('target_role')
  const targetCompanyRaw = formData.get('target_company')
  const targetJdRaw = formData.get('target_jd')
  const targetRole = typeof targetRoleRaw === 'string' ? targetRoleRaw.trim() : ''
  const targetCompany =
    typeof targetCompanyRaw === 'string' ? targetCompanyRaw.trim() : ''
  const targetJd =
    typeof targetJdRaw === 'string' ? targetJdRaw.trim() : ''

  if (targetRole.length < 2 || targetRole.length > 80) {
    return NextResponse.json(
      { error: 'target_role must be 2-80 characters' },
      { status: 400 }
    )
  }
  if (targetCompany.length > 0 && (targetCompany.length < 2 || targetCompany.length > 80)) {
    return NextResponse.json(
      { error: 'target_company must be 2-80 characters when provided' },
      { status: 400 }
    )
  }
  if (targetJd.length > 0 && (targetJd.length < 2 || targetJd.length > 10_000)) {
    return NextResponse.json(
      { error: 'target_jd must be 2-10,000 characters when provided' },
      { status: 400 }
    )
  }

  // Input kind. Defaults to 'pdf' so old clients (pre-M8.C) keep working
  // unchanged — they don't send the input_kind field.
  const inputKindRaw = formData.get('input_kind')
  const inputKind: InputKind =
    inputKindRaw === 'url' || inputKindRaw === 'image' ? inputKindRaw : 'pdf'

  // Per-kind ingest. Each branch populates the same IngestResult shape so
  // the storage + DB insert below is identical across modes.
  let ingest: IngestResult
  try {
    if (inputKind === 'pdf') {
      ingest = await ingestPdf(formData)
    } else if (inputKind === 'image') {
      ingest = await ingestImage(formData)
    } else {
      ingest = await ingestFromUrl(formData)
    }
  } catch (err) {
    if (err instanceof IngestError) {
      return NextResponse.json(
        { error: err.message, detail: err.detail, hint: err.hint },
        { status: err.statusCode }
      )
    }
    if (err instanceof UrlIngestError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      )
    }
    throw err
  }

  if (!ingest.raw_text || ingest.raw_text.trim().length < MIN_RAW_TEXT_CHARS) {
    return NextResponse.json(
      {
        error: 'No usable text could be extracted',
        detail: `Got ${ingest.raw_text?.trim().length ?? 0} characters from the ${inputKind} input.`,
        hint:
          inputKind === 'url'
            ? 'Try a URL pointing directly at a personal site, GitHub README, or Notion page that contains the resume content.'
            : 'Try a clearer image, a different file, or paste your resume text into a PDF and re-upload.',
      },
      { status: 422 }
    )
  }

  // Storage write + DB insert (uniform across input kinds)
  const service = createServiceClient()
  const filePath = `${user.id}/${Date.now()}_${ingest.file_name}`
  const { error: storageError } = await service.storage
    .from('resumes')
    .upload(filePath, ingest.storage_buffer, {
      contentType: ingest.storage_mime,
      upsert: false,
    })
  if (storageError) {
    console.error('[upload] storage error:', storageError)
    return NextResponse.json({ error: 'Failed to store file' }, { status: 500 })
  }

  const { data: resume, error: dbError } = await service
    .from('resumes')
    .insert({
      candidate_id: user.id,
      file_path: filePath,
      file_name: ingest.file_name,
      raw_text: ingest.raw_text,
      target_role: targetRole,
      target_company: targetCompany,
      target_jd: targetJd || null,
      input_kind: inputKind,
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
      has_target_jd: targetJd.length > 0,
      input_kind: inputKind,
      source_url: ingest.source_url,
      bytes_stored: ingest.storage_buffer.byteLength,
    },
  })
  await posthog.shutdown()

  return NextResponse.json({ resumeId: resume.id })
}

// ---------------------------------------------------------------------------
// Per-kind ingest helpers. Each throws IngestError with a JSON-shaped detail
// when input is rejected; callers catch and forward as the response body.
// ---------------------------------------------------------------------------

class IngestError extends Error {
  statusCode: number
  detail?: string
  hint?: string
  constructor(opts: { message: string; statusCode?: number; detail?: string; hint?: string }) {
    super(opts.message)
    this.statusCode = opts.statusCode ?? 400
    this.detail = opts.detail
    this.hint = opts.hint
  }
}

async function ingestPdf(formData: FormData): Promise<IngestResult> {
  const file = formData.get('file') as File | null
  if (!file) {
    throw new IngestError({ message: 'No file provided' })
  }
  if (file.type !== 'application/pdf') {
    throw new IngestError({ message: 'Only PDF files are supported on the PDF path' })
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new IngestError({ message: 'File must be under 10MB' })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let rawText: string
  try {
    rawText = await extractTextFromPDF(buffer, file.name)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[upload] PDF text extraction failed:', err)
    throw new IngestError({
      message: 'Could not extract text from PDF',
      statusCode: 422,
      detail,
      hint: 'The PDF is most likely encrypted or malformed. Try a fresh export from Google Docs / Word.',
    })
  }

  return {
    raw_text: rawText,
    storage_buffer: buffer,
    storage_mime: 'application/pdf',
    file_name: file.name,
  }
}

async function ingestImage(formData: FormData): Promise<IngestResult> {
  const file = formData.get('file') as File | null
  if (!file) {
    throw new IngestError({ message: 'No file provided' })
  }
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    throw new IngestError({
      message: `Unsupported image type ${file.type}. Use PNG, JPEG, or WebP.`,
    })
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new IngestError({ message: 'File must be under 10MB' })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const text = await ocrDocument(buffer, file.name, file.type)
  if (!text) {
    throw new IngestError({
      message: 'OCR could not extract text from the image',
      statusCode: 422,
      hint:
        'Try a higher-resolution scan or a clearer photo. Resumes with light gray text or unusual layouts are particularly hard to OCR.',
    })
  }
  return {
    raw_text: text,
    storage_buffer: buffer,
    storage_mime: file.type,
    file_name: file.name,
  }
}

async function ingestFromUrl(formData: FormData): Promise<IngestResult> {
  const urlRaw = formData.get('url')
  if (typeof urlRaw !== 'string' || urlRaw.trim().length === 0) {
    throw new IngestError({ message: 'No url provided' })
  }
  const { text, source_url, title } = await ingestUrl(urlRaw.trim())
  // Synthesize a .txt file so file_path stays meaningful; lets future
  // re-analysis pass re-extract from the cached page text without re-fetching.
  const fileName = (title ? title.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) : 'page') + '.txt'
  const buffer = Buffer.from(`Source: ${source_url}\n\n${text}`, 'utf8')
  return {
    raw_text: text,
    storage_buffer: buffer,
    storage_mime: 'text/plain; charset=utf-8',
    file_name: fileName,
    source_url,
  }
}
