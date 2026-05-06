import { createHash } from 'node:crypto'
import { Context } from '@/lib/graph'
import { createServiceClient } from '@/lib/supabase/service'
import { ParseResult, PerceptionReport } from '@/types'
import { LoadResumeResult } from './load-resume'
import type { DisagreementResult } from './disagreement'
import type { PerceiveResult } from '@/lib/llm/perceive'
import type { PerceptionDisagreement } from './perception-disagreement'
import { buildApedsFeatures, ALL_LLMS_FAILED_ISSUE } from './perception-disagreement'
import { aiLegibilityScore } from './ai-legibility'

// Soft dependency — runs after the aggregate nodes regardless of their outcome.
// Fails gracefully if Supabase isn't configured.
export async function saveResults(
  ctx: Context
): Promise<{ saved: boolean; tables?: string[]; reason?: string }> {
  const resumeId = ctx.resume_id as string | undefined
  if (!resumeId) return { saved: false, reason: 'No resume_id in context' }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { saved: false, reason: 'Supabase not configured' }
  }

  const supabase = createServiceClient()
  const saved: string[] = []

  const parseData = ctx.parse_resume as { results: ParseResult[] } | undefined
  if (parseData?.results?.length) {
    await supabase.from('parse_results').insert(
      parseData.results.map((r) => ({
        resume_id: resumeId,
        parser_name: r.parser_name,
        raw_output: r.raw_output,
        structured_data: r.structured_data,
        canonical_data: r.canonical_data,
        normalization_issues: r.normalization_issues ?? [],
        parse_score: r.parse_score,
        issues: r.issues,
      }))
    )
    saved.push('parse_results')
  }

  const disagreement = ctx.compute_disagreement as DisagreementResult | null | undefined
  if (disagreement) {
    await supabase.from('parse_disagreement').upsert(
      {
        resume_id: resumeId,
        field_disagreement: disagreement.field_disagreement,
        experience_alignment: disagreement.experience_alignment,
        bullet_count_variance: disagreement.bullet_count_variance,
        overall_score: disagreement.overall_score,
        parser_pair_diffs: disagreement.parser_pair_diffs,
      },
      { onConflict: 'resume_id' }
    )
    saved.push('parse_disagreement')
  }

  // M3: per-query LLM responses (replaces llm_responses for new code paths).
  const allPerceiveResults: PerceiveResult[] = [
    ...((ctx.perceive_gpt4o as PerceiveResult[] | undefined) ?? []),
    ...((ctx.perceive_claude as PerceiveResult[] | undefined) ?? []),
    ...((ctx.perceive_gemini as PerceiveResult[] | undefined) ?? []),
    ...((ctx.perceive_llama as PerceiveResult[] | undefined) ?? []),
  ]
  if (allPerceiveResults.length > 0) {
    await supabase.from('perception_query_responses').upsert(
      allPerceiveResults.map((r) => ({
        resume_id: resumeId,
        model_name: r.model,
        query_key: r.query,
        scalar: r.response.scalar ?? null,
        list_value: r.response.list ?? null,
        text_value: r.response.text ?? null,
        reasoning: r.response.reasoning,
        reasoning_embedding_hash: createHash('sha256').update(r.response.reasoning).digest('hex'),
        cache_hit: r.cache_hit,
        latency_ms: r.latency_ms,
      })),
      { onConflict: 'resume_id,model_name,query_key' }
    )
    saved.push('perception_query_responses')
  }

  const report = ctx.perceive_resume as PerceptionReport | undefined
  const perception = ctx.compute_perception_disagreement as PerceptionDisagreement | null | undefined

  // Build APEDS features. perception is null when 0 LLMs responded — record
  // a high-severity normalization issue so the audit trail explains the gap.
  const features = buildApedsFeatures({
    perception: perception ?? null,
    parseResults: parseData?.results ?? [],
    parseDisagreementOverall: disagreement?.overall_score ?? null,
  })

  const issues = perception ? perception.normalization_issues : [ALL_LLMS_FAILED_ISSUE]
  const legibility = features ? aiLegibilityScore(features) : null

  // Always write a perception_reports row — even on all-LLMs-failed — so the
  // report page always has a row to query and the audit trail is complete.
  await supabase.from('perception_reports').upsert(
    {
      resume_id: resumeId,
      report: report ?? null,
      apeds_features: features,
      ai_legibility_score: legibility,
      normalization_issues: issues,
    },
    { onConflict: 'resume_id' }
  )
  saved.push('perception_reports')

  return { saved: true, tables: saved }
}
