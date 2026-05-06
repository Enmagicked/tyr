// Graph node wrapper around computePerceptionDisagreement. Pulls the
// per-model PerceiveResult arrays from ctx, plus M2's parse_resume output for
// inter-modal δ.

import { Context } from '@/lib/graph'
import type { PerceiveResult } from '@/lib/llm/perceive'
import type { ParseResult } from '@/types'
import {
  computePerceptionDisagreement,
  type PerceptionDisagreement,
} from './perception-disagreement'

export async function computePerceptionDisagreementNode(
  ctx: Context
): Promise<PerceptionDisagreement | null> {
  const all: PerceiveResult[] = [
    ...((ctx.perceive_gpt4o as PerceiveResult[] | undefined) ?? []),
    ...((ctx.perceive_claude as PerceiveResult[] | undefined) ?? []),
    ...((ctx.perceive_gemini as PerceiveResult[] | undefined) ?? []),
    ...((ctx.perceive_llama as PerceiveResult[] | undefined) ?? []),
  ]

  const parseData = ctx.parse_resume as { results: ParseResult[] } | undefined
  const parseResults = parseData?.results ?? null

  return computePerceptionDisagreement(all, parseResults)
}
