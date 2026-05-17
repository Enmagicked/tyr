// OCR for resume / JD inputs, used by:
//   - app/api/upload/route.ts (image-of-resume input)
//   - app/api/upload-jd-image/route.ts (image-of-JD input on target form)
//   - lib/extract-text.ts (PDF fallback when pdf-parse returns near-empty)
//
// Both image and PDF paths go through Claude vision (image via type:'image',
// PDF via type:'document'). Anthropic's SDK accepts PDFs natively, no
// pdf-to-image conversion needed. Single API, single key (ANTHROPIC_API_KEY).
// Affinda was retired here on 2026-05-16.
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
// Claude vision — PDF path. Anthropic accepts PDFs directly via type:'document',
// so we don't need pdf-to-image conversion. Same model + prompt as the image
// path; the API just picks the right code path internally.
// ---------------------------------------------------------------------------

async function ocrPdfViaClaude(
  buffer: Buffer,
  fileName: string
): Promise<string | null> {
  const client = getClient()
  if (!client) {
    console.warn('[ocr] ANTHROPIC_API_KEY not set — Claude PDF OCR unavailable')
    return null
  }

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
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: buffer.toString('base64'),
              },
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
    console.warn('[ocr] Claude PDF vision error:', err instanceof Error ? err.message : err)
    return null
  }
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
  return ocrPdfViaClaude(buffer, fileName)
}
