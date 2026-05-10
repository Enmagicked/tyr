// M8.B: OCR a job-description image and return the extracted text. The form
// (components/upload/target-form.tsx) drops the returned text into the JD
// textarea so the user can confirm/edit before submitting the resume upload.
//
// Image-of-JD is gated behind auth (consistent with /api/upload) — anonymous
// access would let anyone burn Affinda OCR credits.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ocrDocument } from '@/lib/ocr'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB — same cap as /api/upload
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf', // PDFs of JDs are common
])

export async function POST(request: Request) {
  try {
    return await handle(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[upload-jd-image] unhandled error:', err)
    return NextResponse.json(
      { error: 'JD image OCR handler failed', detail: message },
      { status: 500 }
    )
  }
}

async function handle(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type ${file.type}. Use PNG, JPEG, WebP, or PDF.` },
      { status: 400 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const text = await ocrDocument(buffer, file.name, file.type)

  if (!text) {
    return NextResponse.json(
      {
        error: 'Could not extract text from the image',
        hint:
          'OCR returned no usable text. Try a clearer screenshot, a higher-resolution photo, ' +
          'or paste the JD text directly into the textarea.',
      },
      { status: 422 }
    )
  }

  return NextResponse.json({ text })
}
