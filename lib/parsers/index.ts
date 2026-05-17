import { ParseResult } from '@/types'
import { parseWithOpenResume } from './openresume'
import { parseWithNaive } from './naive'

// Legacy precursor to the graph-based /api/analyze pipeline. Still used by
// /api/parse (the standalone parser endpoint). Affinda was removed
// 2026-05-16 along with the rest of the trial-tier integration.
export async function runAllParsers(
  _fileBuffer: Buffer,
  _fileName: string,
  rawText: string
): Promise<ParseResult[]> {
  const settled = await Promise.allSettled([
    Promise.resolve(parseWithOpenResume(rawText)),
    Promise.resolve(parseWithNaive(rawText)),
  ])

  return settled
    .map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      const names = ['openresume', 'naive']
      console.error(`[parsers] ${names[i]} failed:`, result.reason)
      return null
    })
    .filter((r): r is ParseResult => r !== null)
}
