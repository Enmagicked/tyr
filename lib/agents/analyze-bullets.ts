// M5 graph node: bullet-level analysis over the canonical resume.
//
// Picks the parser with the highest parse_score as the source-of-truth
// experience array. Cross-parser bullet variance is already measured by
// compute_disagreement (M2); this node is about per-bullet content quality,
// not parser disagreement.
//
// Output is consumed by:
//   - synthesize_summary.ts as prompt context (so Claude can cite real numbers)
//   - the report page (for direct rendering of "X of Y bullets quantified")
//   - persistence: perception_reports.bullet_analysis (jsonb)

import type { Context } from '@/lib/graph'
import type { ParseResult, ParserName } from '@/types'
import { bulletMetrics, type BulletMetrics } from '../parsers/bullet-metrics.ts'

export interface BulletAnalysisExperience {
  employer: string
  bullet_count: number
  metrics: BulletMetrics
}

export interface BulletAnalysisAggregate {
  total_bullets: number
  total_quantified: number
  total_action_verb: number
  total_buzzword: number
  pct_quantified: number     // 0..1
  pct_action_verb: number
  pct_buzzword: number        // bullets-with-≥1-buzzword / total bullets — informational
  mean_chars_per_bullet: number
}

export interface BulletAnalysis {
  by_experience: BulletAnalysisExperience[]
  aggregate: BulletAnalysisAggregate
  source_parser: ParserName | null
}

function totalBulletsIn(result: ParseResult): number {
  return (result.canonical_data.experience ?? []).reduce(
    (sum, exp) => sum + (exp.bullet_count ?? 0),
    0
  )
}

// M7 (KNOWN_ISSUES 2.1): rank parsers by parse_score desc, then return the
// FIRST one with at least one extracted bullet. The previous "highest-score
// wins" rule misfired when the top-scored parser nailed contact + sections
// but couldn't split a single bullet (e.g. OpenResume on a layout it didn't
// recognize). Falling through to the next-highest gives the bullet-quality
// pipeline real content to analyze instead of "0 of 0 quantified."
//
// If every parser returned zero bullets, we still return the highest-scored
// one so source_parser stays populated and synthesize_summary's no-bullets
// branch fires with the right attribution.
export function pickSourceParser(results: ParseResult[]): ParseResult | null {
  if (results.length === 0) return null
  const ranked = [...results].sort((a, b) => {
    if (b.parse_score !== a.parse_score) return b.parse_score - a.parse_score
    return a.parser_name.localeCompare(b.parser_name)
  })
  return ranked.find((r) => totalBulletsIn(r) > 0) ?? ranked[0]
}

export async function analyzeBullets(ctx: Context): Promise<BulletAnalysis | null> {
  const parseData = ctx.parse_resume as { results: ParseResult[] } | undefined
  const results = parseData?.results ?? []
  const source = pickSourceParser(results)
  if (!source) return null

  const experiences = source.canonical_data.experience ?? []

  const byExperience: BulletAnalysisExperience[] = experiences.map((exp) => {
    const metrics = bulletMetrics(exp.bullets)
    return {
      employer: exp.employer_canonical_id || exp.employer_raw,
      bullet_count: exp.bullet_count,
      metrics,
    }
  })

  const totalBullets = byExperience.reduce((s, e) => s + e.bullet_count, 0)
  const totalQuantified = byExperience.reduce((s, e) => s + e.metrics.quantification, 0)
  const totalActionVerb = byExperience.reduce((s, e) => s + e.metrics.action_verb, 0)
  const totalBuzzword = byExperience.reduce((s, e) => s + e.metrics.buzzword, 0)
  const meanChars =
    totalBullets > 0
      ? byExperience.reduce(
          (s, e) => s + e.metrics.char_stats.mean * e.bullet_count,
          0
        ) / totalBullets
      : 0

  return {
    by_experience: byExperience,
    aggregate: {
      total_bullets: totalBullets,
      total_quantified: totalQuantified,
      total_action_verb: totalActionVerb,
      total_buzzword: totalBuzzword,
      pct_quantified: totalBullets > 0 ? totalQuantified / totalBullets : 0,
      pct_action_verb: totalBullets > 0 ? totalActionVerb / totalBullets : 0,
      pct_buzzword: totalBullets > 0 ? totalBuzzword / totalBullets : 0,
      mean_chars_per_bullet: meanChars,
    },
    source_parser: source.parser_name,
  }
}
