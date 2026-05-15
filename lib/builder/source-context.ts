// M9.5: load builder "source context" — the target metadata + analyzer
// findings from a previously-scanned resume so the builder can prefill
// the target form and condition the generation prompt on the gaps the
// analyzer flagged.

import { createServiceClient } from '@/lib/supabase/service'
import { consensusList, consensusText, type PerceptionQueryRow } from '@/lib/agents/consensus'
import type { CanonicalResume } from '@/types/resume'
import type { BuilderInput } from './types'
import { extractBuilderInputFromText } from './extract'

export interface BuilderSourceContext {
  resume_id: string
  file_name: string | null
  target_role: string | null
  target_company: string | null
  target_jd: string | null
  is_internship: boolean
  top_strengths: string[] | null
  missing_signal: string | null
  // M9.5: when present, BuilderFlow uses this as initial form state so the
  // user iterates from their existing resume rather than re-typing it.
  prefilled_input: BuilderInput | null
}

// Default: full context including the Haiku-extracted prefill. Used by
// /api/builder/prefill (client-side fetch). The heavy LLM call is gated
// by `withExtraction` so /api/builder POST can skip it — that endpoint
// only needs target metadata + insights consensus.
export async function loadBuilderSourceContext(
  resumeId: string,
  candidateId: string,
  options: { withExtraction?: boolean } = { withExtraction: true }
): Promise<BuilderSourceContext | null> {
  const service = createServiceClient()

  const { data: resume } = await service
    .from('resumes')
    .select(
      'id, candidate_id, file_name, raw_text, target_role, target_company, target_jd, is_internship'
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

  // Prefill the form by running the raw resume text through a Claude Haiku
  // extraction pass. This captures EVERY section in the resume — including
  // projects, activities, and awards which the canonical parsers don't
  // touch — and works regardless of which parser succeeded. Falls back to
  // canonical_data mapping if extraction fails (no key, LLM 5xx, etc.).
  let prefilledInput: BuilderInput | null = null
  if (options.withExtraction !== false) {
    const rawText = (resume.raw_text as string | null) ?? ''
    if (rawText.trim().length >= 50) {
      prefilledInput = await extractBuilderInputFromText(rawText)
    }
    if (!prefilledInput) {
      const { data: parses } = await service
        .from('parse_results')
        .select('canonical_data, parse_score')
        .eq('resume_id', resumeId)
        .order('parse_score', { ascending: false, nullsFirst: false })
        .limit(1)
      const canonical = (parses && parses[0]?.canonical_data) as CanonicalResume | null | undefined
      prefilledInput = canonical ? canonicalToBuilderInput(canonical) : null
    }
  }

  return {
    resume_id: resume.id as string,
    file_name: (resume.file_name as string | null) ?? null,
    target_role: (resume.target_role as string | null) ?? null,
    target_company: (resume.target_company as string | null) ?? null,
    target_jd: (resume.target_jd as string | null) ?? null,
    is_internship: !!resume.is_internship,
    top_strengths: topStrengths,
    missing_signal: missingSignal,
    prefilled_input: prefilledInput,
  }
}

// CanonicalResume → BuilderInput mapping for the rebuild flow.
// Preserves user-facing raw values (school_raw, employer_raw, title_raw)
// over the canonicalized ids — those are for the disagreement scorer.
function canonicalToBuilderInput(canon: CanonicalResume): BuilderInput {
  const fmtDate = (iso?: string): string => {
    if (!iso) return ''
    // ISO is YYYY-MM; render YYYY-MM as-is — short, unambiguous.
    return iso
  }
  const fmtRange = (start?: string, end?: string): string => {
    if (start && end) return `${start} — ${end}`
    if (start) return `${start} — present`
    if (end) return end
    return ''
  }
  const links = [
    canon.contact.linkedin_url,
    canon.contact.github_url,
    ...(canon.contact.personal_urls ?? []),
  ]
    .filter((s): s is string => !!s)
    .join(' · ')

  return {
    contact: {
      name: canon.name ?? '',
      email: canon.contact.email ?? '',
      phone: canon.contact.phone ?? '',
      location: '',
      links,
    },
    education: canon.education.map((e) => ({
      school: e.school_raw ?? '',
      degree: e.degree_normalized ?? '',
      field: e.field ?? '',
      graduation: fmtDate(e.end_iso),
      gpa: e.gpa !== undefined ? String(e.gpa) : '',
      coursework: '',
      honors: '',
    })),
    experiences: canon.experience.map((e) => ({
      role: e.title_raw ?? '',
      org: e.employer_raw ?? '',
      dates: fmtRange(e.start_iso, e.end_iso),
      location: '',
      description: e.bullets.join('\n'),
    })),
    projects: [],
    activities: [],
    skills: canon.skills.map((s) => s.name_canonical).join(', '),
    awards: '',
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
