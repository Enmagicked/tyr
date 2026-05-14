// M9.5: load builder "source context" — the target metadata + analyzer
// findings from a previously-scanned resume so the builder can prefill
// the target form and condition the generation prompt on the gaps the
// analyzer flagged.

import { createServiceClient } from '@/lib/supabase/service'
import { consensusList, consensusText, type PerceptionQueryRow } from '@/lib/agents/consensus'

export interface BuilderSourceContext {
  resume_id: string
  file_name: string | null
  target_role: string | null
  target_company: string | null
  target_jd: string | null
  is_internship: boolean
  top_strengths: string[] | null
  missing_signal: string | null
}

export async function loadBuilderSourceContext(
  resumeId: string,
  candidateId: string
): Promise<BuilderSourceContext | null> {
  const service = createServiceClient()

  const { data: resume } = await service
    .from('resumes')
    .select(
      'id, candidate_id, file_name, target_role, target_company, target_jd, is_internship'
    )
    .eq('id', resumeId)
    .single()
  if (!resume || resume.candidate_id !== candidateId) return null

  const { data: rows } = await service
    .from('perception_query_responses')
    .select('model_name, query_key, scalar, list_value, text_value, reasoning')
    .eq('resume_id', resumeId)

  const queryRows: PerceptionQueryRow[] = (rows ?? []) as PerceptionQueryRow[]
  const topStrengths = queryRows.length > 0 ? consensusList(queryRows, 'top_strengths') : null
  const missingSignal = queryRows.length > 0 ? consensusText(queryRows, 'missing_signal') : null

  return {
    resume_id: resume.id as string,
    file_name: (resume.file_name as string | null) ?? null,
    target_role: (resume.target_role as string | null) ?? null,
    target_company: (resume.target_company as string | null) ?? null,
    target_jd: (resume.target_jd as string | null) ?? null,
    is_internship: !!resume.is_internship,
    top_strengths: topStrengths,
    missing_signal: missingSignal,
  }
}

// Build a runtime-only "insights" addendum injected into the generation
// prompt's user message. NOT part of the locked prompt template — it's
// concatenated at the call site so we don't need to bump prompts.lock.json
// every time we add a new field of analyzer-derived guidance.
export function buildInsightsAddendum(ctx: BuilderSourceContext | null): string {
  if (!ctx) return ''
  if (!ctx.missing_signal && (!ctx.top_strengths || ctx.top_strengths.length === 0)) return ''
  const parts: string[] = ['\n\n# Analyzer findings from this candidate\'s previous resume\n']
  parts.push('The following observations came from running this candidate\'s prior resume through tyr\'s 4-LLM analyzer. Use them as guidance — write bullets that AVOID the named gap and LEAN INTO the named strengths. Do not mention "the analyzer" or "the previous resume" in your output; the candidate is iterating, not narrating.')
  if (ctx.missing_signal) {
    parts.push(`\nGap to address: ${ctx.missing_signal}`)
  }
  if (ctx.top_strengths && ctx.top_strengths.length > 0) {
    parts.push(`\nStrengths to lean into:\n${ctx.top_strengths.map((s) => `- ${s}`).join('\n')}`)
  }
  return parts.join('\n')
}
