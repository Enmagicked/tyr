// LLM perception nodes (M3): one node per model. Each runs all 8 q1-q8
// queries via the shared `perceive` invoker, which handles caching,
// JSON-repair, and reasoning embedding.
//
// Aggregate `perceive_resume` synthesizes the legacy PerceptionReport from the
// per-query reasoning text — kept for the M1 report-page rendering path.
// The new APEDS structured outputs (PerceiveResult[]) are consumed by
// compute_perception_disagreement and surfaced as apeds_features.

import { Context } from '@/lib/graph'
import { perceiveAllQueries, type PerceiveResult } from '@/lib/llm/perceive'
import { generatePerceptionReport } from '@/lib/llm/analyze'
import type { LLMResponse, ModelName } from '@/types'
import type { PerceptionQueryContext } from '@/lib/llm/prompts'
import { LoadResumeResult } from './load-resume'

function resumeText(ctx: Context): string {
  return (ctx.load_resume as LoadResumeResult).raw_text
}

function targetContext(ctx: Context): PerceptionQueryContext | undefined {
  const loaded = ctx.load_resume as LoadResumeResult | undefined
  if (!loaded) return undefined
  const role = loaded.target_role
  const company = loaded.target_company
  if (!role && !company) return undefined
  return { target_role: role, target_company: company }
}

export async function perceiveGPT4o(ctx: Context): Promise<PerceiveResult[]> {
  return perceiveAllQueries('gpt-4o', resumeText(ctx), targetContext(ctx))
}

export async function perceiveClaude(ctx: Context): Promise<PerceiveResult[]> {
  return perceiveAllQueries('claude-sonnet-4-6', resumeText(ctx), targetContext(ctx))
}

export async function perceiveGemini(ctx: Context): Promise<PerceiveResult[]> {
  return perceiveAllQueries('gemini-1.5-pro', resumeText(ctx), targetContext(ctx))
}

export async function perceiveLlama(ctx: Context): Promise<PerceiveResult[]> {
  return perceiveAllQueries('llama-3.1-70b', resumeText(ctx), targetContext(ctx))
}

// Adapt PerceiveResult[] back to the M1-style LLMResponse[] shape so the
// existing `generatePerceptionReport` / `analyze.ts` path keeps working.
// We map the new query keys onto the closest legacy prompt_key bucket so the
// report page can still render a freeform overview while M4 redesigns.
const LEGACY_KEY_FOR: Record<string, 'describe' | 'roles' | 'seniority' | 'skills' | 'gaps' | 'recruiter_take'> = {
  seniority: 'seniority',
  technical_depth: 'skills',
  top_strengths: 'skills',
  fit: 'roles',
  final_round_probability: 'recruiter_take',
  key_credential: 'describe',
  missing_signal: 'gaps',
  ai_authored: 'recruiter_take',
}

function toLegacyResponses(results: PerceiveResult[]): LLMResponse[] {
  return results.map((r) => ({
    model_name: r.model,
    prompt_key: LEGACY_KEY_FOR[r.query] ?? 'describe',
    response_text: formatLegacyText(r),
    latency_ms: r.latency_ms,
  }))
}

function formatLegacyText(r: PerceiveResult): string {
  const parts: string[] = []
  if (typeof r.response.scalar === 'number') parts.push(`Score: ${r.response.scalar}`)
  if (r.response.list?.length) parts.push(r.response.list.map((x, i) => `${i + 1}. ${x}`).join('\n'))
  if (r.response.text) parts.push(r.response.text)
  if (r.response.reasoning) parts.push(r.response.reasoning)
  return parts.join('\n\n').trim()
}

export async function synthesizePerception(ctx: Context) {
  const all: PerceiveResult[] = [
    ...((ctx.perceive_gpt4o as PerceiveResult[] | undefined) ?? []),
    ...((ctx.perceive_claude as PerceiveResult[] | undefined) ?? []),
    ...((ctx.perceive_gemini as PerceiveResult[] | undefined) ?? []),
    ...((ctx.perceive_llama as PerceiveResult[] | undefined) ?? []),
  ]

  if (all.length === 0) throw new Error('No LLM responses to synthesize')

  const legacyResponses = toLegacyResponses(all)
  return generatePerceptionReport(
    (ctx.resume_id as string | undefined) ?? 'unknown',
    legacyResponses
  )
}

// Helper for save_results: extracts the set of models that produced any result.
export function modelsResponding(ctx: Context): ModelName[] {
  const seen = new Set<ModelName>()
  for (const node of ['perceive_gpt4o', 'perceive_claude', 'perceive_gemini', 'perceive_llama'] as const) {
    const results = ctx[node] as PerceiveResult[] | undefined
    if (results && results.length > 0) seen.add(results[0].model)
  }
  return [...seen]
}
