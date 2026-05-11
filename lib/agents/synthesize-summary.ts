// M5 graph node: plain-English summary synthesis.
//
// One Claude call after compute_perception_disagreement + analyze_bullets.
// Translates σ/ρ/inter-modal δ + bullet stats + APEDS features into a
// 4-paragraph plain-English explanation. Cached at apeds_summary:v2.
//
// Cache versioning is enforced by lib/agents/synthesize-summary.lock.json
// + the drift test in lib/agents/__tests__/synthesize-summary.test.ts —
// any edit to buildPrompt() breaks `npm test` until the lockfile hash is
// regenerated AND the cache namespace bumped (v2 → v3, ...). This mirrors
// the M3 lockfile pattern in lib/llm/prompts.lock.json.
//
// Fail-soft: any error returns null. The report page renders a
// "Summary unavailable" fallback in that case.

import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { Context } from '@/lib/graph'
import type { ParseResult, NormalizationIssue } from '@/types'
import type { LoadResumeResult } from './load-resume.ts'
import type { ApedsRawFeatures, PerceptionDisagreement } from './perception-disagreement.ts'
import { buildApedsFeatures } from './perception-disagreement.ts'
import type { BulletAnalysis } from './analyze-bullets.ts'
import type { PerceiveResult } from '@/lib/llm/perceive'
import { repairAndParseJson } from '@/lib/llm/perceive'
import { cacheGet, cacheSet } from '@/lib/llm/cache'
import { consensusList, consensusText, type PerceptionQueryRow } from './consensus.ts'
import { buildPrompt, type PlainSummary } from './synthesize-summary-prompt.ts'

export type { PlainSummary } from './synthesize-summary-prompt.ts'
export { hashSummaryPromptTemplate } from './synthesize-summary-prompt.ts'

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
  // M6: v1 → v2. The buildPrompt template changed (anti-filler rules,
  // inline-glossing, recommendations-must-cite-finding, role-only target
  // branch, no-bullets fallback).
  // M8 follow-up: v2 → v3. Banned the meta-commentary phrasing ("X of N
  // judges responded", "partial picture", "directional, not definitive")
  // AND removed n_parsers_responding / n_llms_responding from the prompt
  // input section so the model literally can't see those numbers.
  return `apeds_summary:v3:${resumeId}:${featuresHash}:${bulletHash}`
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

