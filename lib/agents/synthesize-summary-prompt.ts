// Prompt-template module for synthesize_summary. Split out from
// synthesize-summary.ts so the lockfile drift test in
// __tests__/synthesize-summary.test.ts can hash the template without pulling
// the LLM cache + Anthropic SDK (which break Node's bare strip-types
// resolver). Runtime deps here = `node:crypto` only.
//
// Edits to buildPrompt() must be paired with:
//   1. Regenerating the hash in synthesize-summary.lock.json (run the test)
//   2. Bumping `apeds_summary:vN → vN+1` in synthesize-summary.ts
// Otherwise stale cached completions survive into the new prompt and `npm
// test` flags the drift.

import { createHash } from 'node:crypto'
import type { NormalizationIssue } from '@/types'
import type { ApedsRawFeatures } from './perception-disagreement.ts'
import type { BulletAnalysis } from './analyze-bullets.ts'

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
// Format helpers
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

export interface BuildPromptArgs {
  fileName: string
  targetRole: string | null
  targetCompany: string | null
  features: ApedsRawFeatures
  bulletAnalysis: BulletAnalysis
  topStrengths: string[] | null
  missingSignal: string | null
  keyCredential: string | null
}

export function buildPrompt(args: BuildPromptArgs): string {
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

  // M6: company is optional. Three branches mirror the perception `fit` prompt.
  const target =
    targetRole && targetCompany
      ? `${targetRole} at ${targetCompany}`
      : targetRole
        ? targetRole
        : 'a generic senior-level position'

  const byExp = bulletAnalysis.by_experience
    .map(
      (e) =>
        `  - ${e.employer}: ${e.bullet_count} bullets, ${e.metrics.quantification} quantified, ${e.metrics.action_verb} strong-verb start, ${e.metrics.buzzword} buzzwords`
    )
    .join('\n')

  // M6 (2.1c): when no bullets were extracted, the experience_paragraph
  // otherwise reads as "0 of 0 bullets quantified" — useless. Switch the
  // schema instruction to ask for a 1-sentence honest acknowledgement.
  const noBullets = bulletAnalysis.aggregate.total_bullets === 0

  return `You are writing a plain-English explanation of a resume analysis report for the candidate themselves. The reader is NOT technical — they have never seen σ, ρ, "embedding cosine," or "inter-modal δ" before.

# Hard rules

1. **Reference specific numbers from the data** ("3 of 7 bullets quantified at Stripe", "all 4 AI judges agreed on a 7/10 seniority"). Numbers turn vague claims into honest ones.

2. **Banned phrases — do not use any of these, ever:**
   - "successfully parsed", "successfully read", "not corrupted", "good baseline" (these state the obvious and waste the reader's attention)
   - "results-driven", "results-oriented", "strong action verbs", "team player", "self-starter", "synergy", "leverage" (resume-coaching clichés the candidate has already heard a thousand times)
   - "critical structural failure", "structural integrity", "disagreement variance" (jargon-as-decoration; explain the underlying signal in plain words instead)
   - "embedding", "cosine", "σ", "ρ", "δ", "APEDS" (the reader does not know what these mean)

3. **Inline-gloss any technical idea** the moment you mention it. Example: write "the three resume-reading systems disagreed on your job titles" — never "high parser disagreement."

4. **Every recommendation must reference a SPECIFIC finding from the data above** — name the employer, the query, the count, or the specific bullet pattern. Generic edits like "add metrics" or "use stronger verbs" are forbidden. Good: "At Stripe, only 1 of 5 bullets includes a number — add a metric (revenue, % change, throughput) to the other four." Bad: "Add quantified outcomes."

5. **Be specific to THIS resume.** No advice that would apply to any resume.

# Inputs

Resume target: ${target}
File: ${fileName}

Parser data (3 ATS-style resume readers ran in parallel):
- ${features.n_parsers_responding} of 3 readers succeeded
- ATS legibility (how completely they filled in contact + sections): ${pct(features.ats_legibility)}
- ATS fragility (how much the readers disagreed about the fill rate): ${fmt(features.ats_fragility)}
- Overall reader disagreement on the same fields: ${features.overall_parse_disagreement === null ? '—' : fmt(features.overall_parse_disagreement)}

LLM data (4 frontier AI judges were asked the same 8 questions):
- ${features.n_llms_responding} of 4 judges responded
- Mean seniority: ${fmt(features.mean_seniority, 1)}/10 (spread across judges: ${fmt(features.sigma_seniority)})
- Mean technical depth: ${fmt(features.mean_technical_depth, 1)}/10 (spread: ${fmt(features.sigma_technical_depth)})
- Mean fit for ${target}: ${fmt(features.mean_fit, 1)}/10 (spread: ${fmt(features.sigma_fit)})
- Mean final-round probability: ${fmt(features.mean_final_round_prob)}
- Mean AI-authored probability: ${fmt(features.mean_ai_authored)}
- AI-vs-ATS seniority gap (0 = aligned, 1 = maximally different): ${fmt(features.inter_modal_delta)}
- Per-question reasoning spread (0 = judges cited the same evidence, 1 = wholly different evidence): ${rhoSummary(features)}

Bullet-level analysis (using the highest-scoring reader's parse, source: ${bulletAnalysis.source_parser}):
- ${bulletAnalysis.aggregate.total_bullets} total bullets across ${bulletAnalysis.by_experience.length} experiences
- ${bulletAnalysis.aggregate.total_quantified} (${pct(bulletAnalysis.aggregate.pct_quantified)}) contain a number, %, or $ amount
- ${bulletAnalysis.aggregate.total_action_verb} (${pct(bulletAnalysis.aggregate.pct_action_verb)}) start with a concrete action verb
- ${bulletAnalysis.aggregate.total_buzzword} contain a flagged buzzword
- Mean bullet length: ${fmt(bulletAnalysis.aggregate.mean_chars_per_bullet, 0)} characters
- Per-experience breakdown:
${byExp}

Consensus across surviving AI judges:
- Top strengths: ${topStrengths?.join('; ') ?? 'none extracted'}
- Missing signal: ${missingSignal ?? 'none extracted'}
- Key credential: ${keyCredential ?? 'none extracted'}

# Output

Return ONLY a JSON object. No prose, no markdown fences. Schema:
{
  "ats_paragraph": "<3-5 sentences. Explain in plain language where the readers agreed and where they didn't, and what that practically means for the resume going through an applicant tracking system. Cite at least one specific number from the parser data above. Do not say the file 'parsed successfully' or anything equivalent — that is the floor, not a finding.>",
  "experience_paragraph": "${noBullets ? '<1-2 sentences. The reader extracting your bullets returned zero, which usually means the resume formats experience in an unusual layout (a table, multi-column, or a heavy graphical theme). Acknowledge this honestly and tell the candidate what to try (e.g., re-export from Google Docs as a single-column PDF) — do NOT pretend to analyze bullets that were not extracted.>' : '<4-6 sentences. Analyze the experience bullets specifically. Cite the quantification count, the action-verb count, and any buzzword issue with the actual numbers. Name the employer with the strongest bullets and the one with the weakest. Do not lecture about action verbs in the abstract.>'}",
  "ai_consensus_paragraph": "<4-6 sentences. Translate the spread numbers above into plain language: low spread = the AI judges saw the same person, high spread = they read radically different resumes. Translate the per-question spread into 'they cited the same evidence' vs 'they cited different evidence.' Surface the AI-vs-ATS gap as 'how the AI sees you' vs 'how the structural reading sees you.' Reference the target role: ${target}. Do not use the symbols σ, ρ, or δ.>",
  "recommendations": [
    "<edit #1: 1-2 sentences. Must name a specific employer, bullet, section, or metric from the data above. Generic advice is rejected.>",
    "<edit #2: 1-2 sentences, same constraint.>",
    "<edit #3: 1-2 sentences, same constraint.>"
  ]
}`
}

// ---------------------------------------------------------------------------
// Lockfile drift hash
// ---------------------------------------------------------------------------

const SUMMARY_SENTINEL_ARGS: BuildPromptArgs = {
  fileName: '__SENTINEL_FILE__.pdf',
  targetRole: '__SENTINEL_ROLE__',
  targetCompany: '__SENTINEL_COMPANY__',
  features: {
    n_parsers_responding: 3,
    n_llms_responding: 4,
    ats_legibility: 0.5,
    ats_fragility: 0.1,
    overall_parse_disagreement: 0.3,
    mean_seniority: 6,
    sigma_seniority: 1,
    mean_technical_depth: 6,
    sigma_technical_depth: 1,
    mean_fit: 6,
    sigma_fit: 1,
    mean_final_round_prob: 0.5,
    mean_ai_authored: 0.3,
    inter_modal_delta: 0.2,
    rho_seniority: 0.4,
    rho_technical_depth: 0.4,
    rho_top_strengths: 0.4,
    rho_fit: 0.4,
    rho_final_round_probability: 0.4,
    rho_key_credential: 0.4,
    rho_missing_signal: 0.4,
    rho_ai_authored: 0.4,
  } as ApedsRawFeatures,
  bulletAnalysis: {
    source_parser: '__SENTINEL_PARSER__',
    aggregate: {
      total_bullets: 5,
      total_quantified: 2,
      pct_quantified: 0.4,
      total_action_verb: 4,
      pct_action_verb: 0.8,
      total_buzzword: 1,
      mean_chars_per_bullet: 120,
    },
    by_experience: [
      {
        employer: '__SENTINEL_EMPLOYER__',
        bullet_count: 5,
        metrics: { quantification: 2, action_verb: 4, buzzword: 1 },
      },
    ],
  } as unknown as BulletAnalysis,
  topStrengths: ['__S1__', '__S2__', '__S3__'],
  missingSignal: '__SENTINEL_GAP__',
  keyCredential: '__SENTINEL_CREDENTIAL__',
}

export function hashSummaryPromptTemplate(): string {
  const rendered = buildPrompt(SUMMARY_SENTINEL_ARGS)
  return createHash('sha256').update(rendered).digest('hex').slice(0, 16)
}
