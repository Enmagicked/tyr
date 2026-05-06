import { Context } from '@/lib/graph'
import { parseWithAffinda } from '@/lib/parsers/affinda'
import { parseWithOpenResume } from '@/lib/parsers/openresume'
import { parseWithNaive } from '@/lib/parsers/naive'
import { ParseResult } from '@/types'
import { LoadResumeResult } from './load-resume'

function resume(ctx: Context): LoadResumeResult {
  return ctx.load_resume as LoadResumeResult
}

export async function parseAffinda(ctx: Context) {
  const { file_buffer, file_name } = resume(ctx)
  return parseWithAffinda(file_buffer, file_name)
}

export async function parseOpenResume(ctx: Context) {
  return parseWithOpenResume(resume(ctx).raw_text)
}

export async function parseNaive(ctx: Context) {
  return parseWithNaive(resume(ctx).raw_text)
}

// Aggregates whatever parsers succeeded — partial results are better than none.
export async function synthesizeParse(ctx: Context): Promise<{ results: ParseResult[]; count: number }> {
  const results = (['parse_affinda', 'parse_openresume', 'parse_naive'] as const)
    .map((name) => ctx[name] as ParseResult | undefined)
    .filter((r): r is ParseResult => r !== undefined)

  if (results.length === 0) throw new Error('No parser produced results')

  return { results, count: results.length }
}
