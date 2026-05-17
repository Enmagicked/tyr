// pdf-parse v1.x — known-stable in Node serverless. v2.x failed on Vercel
// nodejs24.x with `ReferenceError: DOMMatrix is not defined` because v2
// pulls in pdfjs-dist 5.x which expects browser DOM APIs.
//
// Lazy-imported so any future module-init failure surfaces as a per-request
// catchable error, not a FUNCTION_INVOCATION_FAILED on cold start.
//
// M6 (KNOWN_ISSUES 1.1): when pdf-parse returns < 50 chars (typical for
// image-only / scanned PDFs), fall through to Claude vision OCR. The 50-char
// threshold matches the upload route's "extracted nothing usable" gate
// — if OCR still can't get past it, the route returns 422 as before.
const MIN_USEFUL_CHARS = 50

export async function extractTextFromPDF(
  buffer: Buffer,
  fileName = 'resume.pdf'
): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  const text = data.text ?? ''
  if (text.trim().length >= MIN_USEFUL_CHARS) return text

  const { ocrDocument } = await import('./ocr.ts')
  const ocrText = await ocrDocument(buffer, fileName)
  return ocrText ?? text
}
