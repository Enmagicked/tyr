// Lazy-load pdf-parse so a module-init failure (e.g. native bindings missing
// on Vercel's nodejs runtime) surfaces as a catchable error inside the route
// instead of crashing module load with FUNCTION_INVOCATION_FAILED.
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}
