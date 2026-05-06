import type { Context } from '@/lib/graph'
import type { ParseResult } from '@/types'
import {
  computeDisagreementFromResults,
  type DisagreementResult,
} from './disagreement'

// Graph node: depends optionally on parse_resume. Runs after parsers aggregate.
// Returns null when 0 parsers succeeded — save_results then skips writing the
// parse_disagreement row entirely (the resume already failed parsing).
export async function computeDisagreement(
  ctx: Context
): Promise<DisagreementResult | null> {
  const parseData = ctx.parse_resume as { results: ParseResult[] } | undefined
  const results = parseData?.results ?? []
  if (results.length === 0) return null
  return computeDisagreementFromResults(results)
}
