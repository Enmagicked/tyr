// pdf-parse v1.x — known-stable in Node serverless. v2.x failed on Vercel
// nodejs24.x with `ReferenceError: DOMMatrix is not defined` because v2
// pulls in pdfjs-dist 5.x which expects browser DOM APIs.
//
// Lazy-imported so any future module-init failure surfaces as a per-request
// catchable error, not a FUNCTION_INVOCATION_FAILED on cold start.
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
}
