// M9.5 (post-launch): LLM-backed parser node.
//
// The fragmented openresume + naive parsers struggle on real-world
// resumes — they miss projects, activities, awards, and they fumble
// experience extraction on non-standard layouts. We already built
// lib/builder/extract.ts to populate the Builder form from raw_text;
// promoting it to a full parser node gives the analyzer:
//   1. A third high-quality canonical_data source so cross-parser
//      disagreement isn't dominated by parser bugs.
//   2. A reliable bullet source for analyze_bullets — which previously
//      reported "0 of 0 bullets quantified" whenever openresume
//      couldn't extract bullets from the user's layout.
//
// Implementation: extract.ts already returns BuilderInput. We adapt
// that to the legacy ParsedResume shape and run lib/parsers/normalize
// to produce CanonicalResume for the disagreement scorer.

import type { Context } from '@/lib/graph'
import type { ParseResult, ParsedResume, Education, WorkExperience } from '@/types'
import { extractBuilderInputFromText } from '@/lib/builder/extract'
import { normalize } from '@/lib/parsers/normalize'
import type { LoadResumeResult } from './load-resume'
import type { BuilderInput } from '@/lib/builder/types'

// Builder generation can populate this for the builder's own "post-build"
// scoring run — when /api/builder kicks off /api/analyze, the analyzer
// runs over the just-rendered raw_text and would re-pay the Haiku
// extraction. Caller passes the BuilderInput we already generated to
// short-circuit. (Optional plumbing — falls through to extraction when
// ctx doesn't carry it.)
type ParseLLMContext = Context & { builder_input?: BuilderInput }

export async function parseWithLlm(ctx: ParseLLMContext): Promise<ParseResult> {
  const loaded = ctx.load_resume as LoadResumeResult | undefined
  const rawText = loaded?.raw_text ?? ''
  let input: BuilderInput | null = null

  // Builder-side optimization: if the caller already has the structured
  // input (the user just submitted /api/builder), skip the LLM call.
  if (ctx.builder_input && typeof ctx.builder_input === 'object') {
    input = ctx.builder_input as BuilderInput
  } else if (rawText.trim().length >= 50) {
    input = await extractBuilderInputFromText(rawText)
  }

  if (!input) {
    // Return an empty-but-valid ParseResult so the graph keeps moving.
    // parse_score 0 means the aggregator deprioritizes this entry.
    const empty: ParsedResume = {
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      languages: [],
    }
    const { canonical, issues } = normalize(empty, 'llm')
    return {
      parser_name: 'llm',
      raw_output: { error: 'extraction_failed_or_empty' },
      structured_data: empty,
      canonical_data: canonical,
      normalization_issues: issues,
      parse_score: 0,
      issues: [{ field: 'general', issue: 'LLM extraction returned no usable data', severity: 'high' }],
    }
  }

  const parsed = builderInputToParsedResume(input)
  const { canonical, issues: normIssues } = normalize(parsed, 'llm')

  // The LLM parser is the high-quality baseline — score it accordingly so
  // analyze_bullets prefers it when picking source_parser. Score reflects
  // section coverage (every section present nudges toward 1.0).
  const score = computeCoverageScore(input)

  return {
    parser_name: 'llm',
    raw_output: input,
    structured_data: parsed,
    canonical_data: canonical,
    normalization_issues: normIssues,
    parse_score: score,
    issues: [],
  }
}

function builderInputToParsedResume(input: BuilderInput): ParsedResume {
  // Split skills string back into an array. The user (or extractor) may
  // have used commas, bullets, semicolons, or newlines — handle all.
  const skills = (input.skills ?? '')
    .split(/[,;·\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 60)

  // Convert experiences to WorkExperience. Dates string is split on " — "
  // or "-" into start/end. Description is preserved verbatim.
  const experience: WorkExperience[] = input.experiences.map((e) => {
    const { start, end, current } = splitDateRange(e.dates ?? '')
    return {
      title: e.role || undefined,
      company: e.org || undefined,
      start_date: start || undefined,
      end_date: current ? undefined : end || undefined,
      is_current: current,
      description: e.description || undefined,
    }
  })

  const education: Education[] = input.education.map((ed) => ({
    institution: ed.school || undefined,
    degree: ed.degree || undefined,
    field: ed.field || undefined,
    graduation_date: ed.graduation || undefined,
    gpa: ed.gpa || undefined,
  }))

  // Extract LinkedIn from contact.links freeform string if present.
  const linkedin = extractLinkedIn(input.contact.links ?? '')

  return {
    name: input.contact.name || undefined,
    email: input.contact.email || undefined,
    phone: input.contact.phone || undefined,
    location: input.contact.location || undefined,
    linkedin,
    skills,
    experience,
    education,
    certifications: [],
    languages: [],
  }
}

function splitDateRange(s: string): { start?: string; end?: string; current: boolean } {
  if (!s) return { current: false }
  const t = s.trim()
  const presentRe = /\b(present|current|now|ongoing)\b/i
  const current = presentRe.test(t)
  // Split on em/en dash, hyphen, " to ", " – "
  const parts = t.split(/\s*(?:—|–|-|to)\s*/i).map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { start: parts[0], end: current ? undefined : parts[1], current }
  }
  if (parts.length === 1) {
    return { start: parts[0], current }
  }
  return { current }
}

function extractLinkedIn(s: string): string | undefined {
  const m = s.match(/(linkedin\.com\/in\/[\w-]+)/i)
  return m ? m[1] : undefined
}

// Coverage-based parse_score. Each major section present adds to the
// score; rewards complete extraction over thin extractions.
function computeCoverageScore(input: BuilderInput): number {
  let score = 0
  if (input.contact.name) score += 0.15
  if (input.contact.email) score += 0.10
  if (input.education.length > 0) score += 0.15
  if (input.experiences.length > 0) score += 0.25
  if (input.experiences.some((e) => e.description && e.description.trim().length > 20)) score += 0.10
  if (input.projects.length > 0) score += 0.10
  if (input.activities.length > 0) score += 0.05
  if (input.skills && input.skills.trim().length > 5) score += 0.10
  // Cap at 0.95 so a perfect openresume parse can still beat the LLM
  // when it really nails an unusual layout — keep the chooser flexible.
  return Math.min(0.95, score)
}
