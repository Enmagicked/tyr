// M5 graph node: plain-English summary synthesis.
//
// One Claude call after compute_perception_disagreement + analyze_bullets.
// Translates σ/ρ/inter-modal δ + bullet stats + APEDS features into a
// 4-paragraph plain-English explanation. Cached at apeds_summary:v1.
//
// Fail-soft: any error returns null. The report page renders a
// "Summary unavailable" fallback in that case.

import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { Context } from '@/lib/graph'
import type { ParseResult, NormalizationIssue } from '@/types'
import type { LoadResumeResult } from './load-resume'
import type { ApedsRawFeatures, PerceptionDisagreement } from './perception-disagreement'
import { buildApedsFeatures } from './perception-disagreement'
import type { BulletAnalysis } from './analyze-bullets'
import type { PerceiveResult } from '@/lib/llm/perceive'
import { repairAndParseJson } from '@/lib/llm/perceive'
import { cacheGet, cacheSet } from '@/lib/llm/cache'
import { consensusList, consensusText, type PerceptionQueryRow } from './consensus'

export interface PlainSummary {
  ats_paragraph: string
  experience_paragraph: string
  ai_consensus_paragraph: string
  recommendations: string[]   // 3 entries
  // Soft non-fatal issues from validation (e.g. recommendations were 2 items
  // not 3 — we accept and record for audit).
  normalization_issues?: NormalizationIssue[]
}

// ---------------------------------------------------------------------------
// Prompt construction — pull all the inputs out of ctx, format compactly.
// ---------------------------------------------------------------------------

function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

function rhoSummary(features: ApedsRawFeatures): string {
  const entries: [string, number | null][] = [
    ['seniority', features.rho_seniority],
    ['technical_depth', features.rho_technical_depth],
    ['top_strengths', features.rho_top_strengths],
    ['fit', features.rho_fit],
    ['final_round', features.rho_final_round_probability],
    ['key_credential', features.rho_key_credential],
    ['missing_signal', features.rho_missing_signal],
    ['ai_authored', features.rho_ai_authored],
  ]
  return entries
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}=${fmt(v)}`)
    .join(', ')
}

interface BuildPromptArgs {
  fileName: string
  targetRole: string | null
  targetCompany: string | null
  features: ApedsRawFeatures
  bulletAnalysis: BulletAnalysis
  topStrengths: string[] | null
  missingSignal: string | null
  keyCredential: string | null
}

function buildPrompt(args: BuildPromptArgs): string {
  const {
    fileName,
    targetRole,
    targetCompany,
    features,
    bulletAnalysis,
    topStrengths,
    missingSignal,
    keyCredential,
  } = args

  const target =
    targetRole && targetCompany
      ? `${targetRole} at ${targetCompany}`
      : 'a generic senior-level position'

  const byExp = bulletAnalysis.by_experience
    .map(
      (e) =>
        `  - ${e.employer}: ${e.bullet_count} bullets, ${e.metrics.quantification} quantified, ${e.metrics.action_verb} strong-verb start, ${e.metrics.buzzword} buzzwords`
    )
    .join('\n')

  return `You are writing a plain-English explanation of an APEDS resume analysis report for the candidate. The reader is NOT technical — they will not understand σ, ρ, or "embedding cosine."

You have these measurements to translate. Reference SPECIFIC NUMBERS from the data ("3 of 7 bullets") to ground your prose. Avoid: hedging, jargon, generic resume advice. Be specific to THIS resume.

Resume target: ${target}
File: ${fileName}

Parser data (3 ATS-style parsers ran in parallel):
- ${features.n_parsers_responding} of 3 parsers succeeded
- ATS legibility (mean fill rate of contact + sections): ${pct(features.ats_legibility)}
- ATS fragility (variance of fill rate across parsers): ${fmt(features.ats_fragility)}
- Overall parse disagreement: ${features.overall_parse_disagreement === null ? '—' : fmt(features.overall_parse_disagreement)}

LLM data (4 frontier LLMs were asked the same 8 queries):
- ${features.n_llms_responding} of 4 LLMs responded
- Mean seniority: ${fmt(features.mean_seniority, 1)}/10 (σ ${fmt(features.sigma_seniority)})
- Mean technical depth: ${fmt(features.mean_technical_depth, 1)}/10 (σ ${fmt(features.sigma_technical_depth)})
- Mean fit for ${target}: ${fmt(features.mean_fit, 1)}/10 (σ ${fmt(features.sigma_fit)})
- Mean final-round probability: ${fmt(features.mean_final_round_prob)}
- Mean AI-authored probability: ${fmt(features.mean_ai_authored)}
- Inter-modal δ (AI vs ATS seniority gap, 0=aligned, 1=max): ${fmt(features.inter_modal_delta)}
- Reasoning dispersion ρ per query (0=identical, 1=fully different): ${rhoSummary(features)}

Bullet-level analysis (best-scoring parser's experience array, source: ${bulletAnalysis.source_parser}):
- ${bulletAnalysis.aggregate.total_bullets} total bullets across ${bulletAnalysis.by_experience.length} experiences
- ${bulletAnalysis.aggregate.total_quantified} (${pct(bulletAnalysis.aggregate.pct_quantified)}) contain quantified outcomes
- ${bulletAnalysis.aggregate.total_action_verb} (${pct(bulletAnalysis.aggregate.pct_action_verb)}) start with strong action verbs
- ${bulletAnalysis.aggregate.total_buzzword} contain vague phrases ("team player", "results-driven", etc.)
- Mean bullet length: ${fmt(bulletAnalysis.aggregate.mean_chars_per_bullet, 0)} chars
- Per-experience breakdown:
${byExp}

Consensus across surviving LLMs:
- Top strengths: ${topStrengths?.join('; ') ?? 'none extracted'}
- Missing signal: ${missingSignal ?? 'none extracted'}
- Key credential: ${keyCredential ?? 'none extracted'}

Return ONLY a JSON object. No prose, no markdown fences. Schema:
{
  "ats_paragraph": "<3-5 sentences explaining what the parsers saw — where they agreed, where they didn't, what that means for ATS systems in the wild. Cite at least one specific number.>",
  "experience_paragraph": "<4-6 sentences specifically analyzing experience bullets. Cite quantification rate, action-verb rate, and any buzzword issue with the actual numbers. Mention which experience role had the strongest/weakest bullets if relevant.>",
  "ai_consensus_paragraph": "<4-6 sentences on how the AI judges read this candidate. Translate σ into 'agreed' vs 'disagreed' language. Translate ρ into 'looking at the same things' vs 'different things'. Surface inter-modal δ as 'AI views vs ATS structural read'. Reference the target role: ${target}.>",
  "recommendations": [
    "<concrete edit #1, 1-2 sentences, references a specific bullet or section>",
    "<concrete edit #2, 1-2 sentences>",
    "<concrete edit #3, 1-2 sentences>"
  ]
}`
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function summaryCacheKey(
  resumeId: string,
  features: ApedsRawFeatures,
  bulletAnalysis: BulletAnalysis
): string {
  // Hash the inputs that determine summary content. resume_id alone isn't
  // enough — features/bullets can change as the upstream pipeline evolves.
  const featuresHash = createHash('sha256')
    .update(JSON.stringify(features))
    .digest('hex')
    .slice(0, 16)
  const bulletHash = createHash('sha256')
    .update(JSON.stringify(bulletAnalysis))
    .digest('hex')
    .slice(0, 16)
  return `apeds_summary:v1:${resumeId}:${featuresHash}:${bulletHash}`
}

// ---------------------------------------------------------------------------
// Validation — accept partial output, flag issues for audit
// ---------------------------------------------------------------------------

function validate(parsed: Record<string, unknown> | null): PlainSummary | null {
  if (!parsed) return null
  const issues: NormalizationIssue[] = []

  const ats = typeof parsed.ats_paragraph === 'string' ? parsed.ats_paragraph : ''
  const exp =
    typeof parsed.experience_paragraph === 'string' ? parsed.experience_paragraph : ''
  const ai =
    typeof parsed.ai_consensus_paragraph === 'string'
      ? parsed.ai_consensus_paragraph
      : ''

  if (!ats) issues.push({ field: 'ats_paragraph', reason: 'missing or empty', severity: 'high' })
  if (!exp) issues.push({ field: 'experience_paragraph', reason: 'missing or empty', severity: 'high' })
  if (!ai) issues.push({ field: 'ai_consensus_paragraph', reason: 'missing or empty', severity: 'high' })

  // Bail entirely if we got no paragraphs at all — the summary is useless.
  if (!ats && !exp && !ai) return null

  let recs: string[] = []
  if (Array.isArray(parsed.recommendations)) {
    recs = parsed.recommendations.filter((x): x is string => typeof x === 'string').slice(0, 5)
  }
  if (recs.length < 3) {
    issues.push({
      field: 'recommendations',
      reason: `expected 3 recommendations, got ${recs.length}`,
      severity: 'low',
    })
  }

  return {
    ats_paragraph: ats,
    experience_paragraph: exp,
    ai_consensus_paragraph: ai,
    recommendations: recs,
    normalization_issues: issues.length > 0 ? issues : undefined,
  }
}

// ---------------------------------------------------------------------------
// Claude dispatch
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (_client) return _client
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

async function callClaude(prompt: string): Promise<string> {
  const r = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  })
  return r.content[0]?.type === 'text' ? r.content[0].text : ''
}

// ---------------------------------------------------------------------------
// Graph node
// ---------------------------------------------------------------------------

export async function synthesizeSummary(ctx: Context): Promise<PlainSummary | null> {
  try {
    const resumeId = (ctx.resume_id as string | undefined) ?? null
    if (!resumeId) return null

    const perception = ctx.compute_perception_disagreement as
      | PerceptionDisagreement
      | null
      | undefined
    const bulletAnalysis = ctx.analyze_bullets as BulletAnalysis | null | undefined
    if (!perception || !bulletAnalysis) return null

    // Need APEDS features — they're built in save_results, but we need them
    // here BEFORE save_results runs. Build directly from perception +
    // parse_disagreement so we don't depend on save_results' output.
    const parseData = ctx.parse_resume as { results: ParseResult[] } | undefined
    const parseResults = parseData?.results ?? []
    const parseDisagreement = ctx.compute_disagreement as
      | { overall_score: number | null }
      | null
      | undefined

    const features = buildApedsFeatures({
      perception,
      parseResults,
      parseDisagreementOverall: parseDisagreement?.overall_score ?? null,
    })
    if (!features) return null

    // Consensus blocks
    const allPerceiveResults: PerceiveResult[] = [
      ...((ctx.perceive_gpt4o as PerceiveResult[] | undefined) ?? []),
      ...((ctx.perceive_claude as PerceiveResult[] | undefined) ?? []),
      ...((ctx.perceive_gemini as PerceiveResult[] | undefined) ?? []),
      ...((ctx.perceive_llama as PerceiveResult[] | undefined) ?? []),
    ]
    const queryRows: PerceptionQueryRow[] = allPerceiveResults.map((r) => ({
      model_name: r.model,
      query_key: r.query,
      scalar: r.response.scalar ?? null,
      list_value: r.response.list ?? null,
      text_value: r.response.text ?? null,
      reasoning: r.response.reasoning,
    }))
    const topStrengths = consensusList(queryRows, 'top_strengths')
    const missingSignal = consensusText(queryRows, 'missing_signal')
    const keyCredential = consensusText(queryRows, 'key_credential')

    // Resume metadata
    const loaded = ctx.load_resume as LoadResumeResult | undefined
    const fileName = loaded?.file_name ?? 'resume.pdf'
    const targetRole = loaded?.target_role ?? null
    const targetCompany = loaded?.target_company ?? null

    // Cache lookup
    const key = summaryCacheKey(resumeId, features, bulletAnalysis)
    const cached = await cacheGet<PlainSummary>(key)
    if (cached) return cached

    const prompt = buildPrompt({
      fileName,
      targetRole,
      targetCompany,
      features,
      bulletAnalysis,
      topStrengths,
      missingSignal,
      keyCredential,
    })

    const text = await callClaude(prompt)
    const parsed = repairAndParseJson(text)
    const summary = validate(parsed)
    if (summary) await cacheSet(key, summary)
    return summary
  } catch (err) {
    console.warn('[synthesize_summary] failed:', err)
    return null
  }
}

