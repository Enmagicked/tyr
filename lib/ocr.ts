// OCR fallback for low-text PDFs (M6 — KNOWN_ISSUES.md item 1.1).
//
// Strategy: Affinda's /v3/documents endpoint runs OCR natively on
// image-only / scanned PDFs and returns extracted text in `meta.rawText`.
// We already have the API key and call the same endpoint from
// lib/parsers/affinda.ts, so the auth + transport pattern is mirrored.
//
// Designed for M8 reuse: takes a generic byte buffer + MIME type so the
// same helper can later back image-of-resume / image-of-JD ingest paths.
//
// Returns null if OCR is unavailable (no API key) or fails (network /
// HTTP error / no text in response). Callers must treat null as "OCR
// could not help" and fall through to whatever their final-failure path is.

const AFFINDA_BASE = 'https://api.affinda.com/v3'

interface AffindaTextResponse {
  meta?: { rawText?: string }
  // Defensive: older API versions / variant endpoints may surface text
  // elsewhere; we look in a couple of obvious spots before giving up.
  data?: { rawText?: string; text?: string }
}

export async function ocrDocument(
  buffer: Buffer,
  fileName = 'document.pdf',
  mimeType = 'application/pdf'
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
  if (!text || text.trim().length < 50) return null
  return text
}
