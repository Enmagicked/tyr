import { ParseResult } from '@/types'
import { parseWithAffinda } from './affinda'
import { parseWithOpenResume } from './openresume'
import { parseWithNaive } from './naive'

export async function runAllParsers(
  fileBuffer: Buffer,
  fileName: string,
  rawText: string
): Promise<ParseResult[]> {
  const settled = await Promise.allSettled([
    parseWithAffinda(fileBuffer, fileName),
    Promise.resolve(parseWithOpenResume(rawText)),
    Promise.resolve(parseWithNaive(rawText)),
  ])

  return settled
    .map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      const names = ['affinda', 'openresume', 'naive']
      console.error(`[parsers] ${names[i]} failed:`, result.reason)
      return null
    })
    .filter((r): r is ParseResult => r !== null)
}
