// OCR for resume / JD inputs, used by:
//   - app/api/upload/route.ts (image-of-resume input)
//   - app/api/upload-jd-image/route.ts (image-of-JD input on target form)
//   - lib/extract-text.ts (PDF fallback when pdf-parse returns near-empty)
//
// M9.5: Hybrid OCR. For image MIME types (PNG/JPEG/GIF/WebP) we use Claude
// Sonnet vision — reliable, no trial-tier flakiness, ~$0.005-0.01/call.
// For PDFs we keep the legacy Affinda path because Claude vision doesn't
// accept PDFs directly and converting PDF → image server-side would need a
// canvas dependency we don't carry. Per-tenant Affinda issues (M7
// KNOWN_ISSUES 2.2) only affected parsing, not OCR text extraction, so the
// PDF fallback should still work — if it stops, we'd swap in pdf-to-image
// → Claude vision in v2.
//
// Returns null when OCR is unavailable or the extracted text < 50 chars.
// Callers treat null as "OCR could not help" and propagate a 422.

import Anthropic from '@anthropic-ai/sdk'

const MIN_USEFUL_CHARS = 50

// ---------------------------------------------------------------------------
// Claude vision — for image inputs
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const OCR_PROMPT = `Transcribe ALL visible text from this image as plain text, preserving:
- Section structure (insert blank lines between sections / experience entries)
- Bullet points (use "- " prefix for each bullet)
- Line breaks between distinct lines (don't collapse multi-line content into one line)
- Dates, employer names, role titles, and any numbers exactly as written

Do NOT summarize, paraphrase, rewrite, or omit anything. Do NOT add commentary or markdown fences. Output only the transcribed text.

If the image is unreadable or contains no text, output the literal string "NO_TEXT_FOUND".`

type ClaudeImageMedia = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

function toClaudeMedia(mimeType: string): ClaudeImageMedia | null {
  const t = mimeType.toLowerCase()
  if (t === 'image/jpeg' || t === 'image/jpg') return 'image/jpeg'
  if (t === 'image/png') return 'image/png'
  if (t === 'image/gif') return 'image/gif'
  if (t === 'image/webp') return 'image/webp'
  return null
}

async function ocrImageViaClaude(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string | null> {
  const client = getClient()
  if (!client) {
    console.warn('[ocr] ANTHROPIC_API_KEY not set — Claude OCR unavailable')
    return null
  }
  const media = toClaudeMedia(mimeType)
  if (!media) return null

  try {
    const r = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: media, data: buffer.toString('base64') },
            },
            { type: 'text', text: OCR_PROMPT },
          ],
        },
      ],
    })
    const text = r.content[0]?.type === 'text' ? r.content[0].text : ''
    if (!text || text.trim() === 'NO_TEXT_FOUND') {
      console.warn(`[ocr] Claude returned no readable text for ${fileName}`)
      return null
    }
    if (text.trim().length < MIN_USEFUL_CHARS) {
      console.warn(`[ocr] Claude returned only ${text.trim().length} chars for ${fileName}`)
      return null
    }
    return text
  } catch (err) {
    console.warn('[ocr] Claude vision error:', err instanceof Error ? err.message : err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Affinda — legacy PDF OCR fallback
// ---------------------------------------------------------------------------

const AFFINDA_BASE = 'https://api.affinda.com/v3'

interface AffindaTextResponse {
  meta?: { rawText?: string }
  data?: { rawText?: string; text?: string }
}

async function ocrPdfViaAffinda(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string | null> {
  const apiKey = process.env.AFFINDA_API_KEY
  if (!apiKey) return null

  const formData = new FormData()
  formData.append(
    'file',
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    fileName
  )
  formData.append('wait', 'true')

  let response: Response
  try {
    response = await fetch(`${AFFINDA_BASE}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })
  } catch (err) {
    console.warn('[ocr] Affinda network error:', err instanceof Error ? err.message : err)
    return null
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.warn(`[ocr] Affinda HTTP ${response.status}: ${detail.slice(0, 300)}`)
    return null
  }

  let body: AffindaTextResponse
  try {
    body = (await response.json()) as AffindaTextResponse
  } catch {
    return null
  }

  const text = body.meta?.rawText ?? body.data?.rawText ?? body.data?.text ?? null
  if (!text || text.trim().length < MIN_USEFUL_CHARS) return null
  return text
}

// ---------------------------------------------------------------------------
// Public entry — routes to the right backend by MIME type.
// ---------------------------------------------------------------------------

export async function ocrDocument(
  buffer: Buffer,
  fileName = 'document.pdf',
  mimeType = 'application/pdf'
): Promise<string | null> {
  if (mimeType.startsWith('image/')) {
    return ocrImageViaClaude(buffer, fileName, mimeType)
  }
  return ocrPdfViaAffinda(buffer, fileName, mimeType)
}
