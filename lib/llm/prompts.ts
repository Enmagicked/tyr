// M3 structured prompt suite — replaces freeform M1 prompts. Each query has a
// stable key, a prompt template, and an expected JSON shape. Keys are used as
// cache namespaces and DB column keys, so RENAMING IS A BREAKING CHANGE that
// invalidates the cache (bump apeds:v1 → apeds:v2 in lib/llm/cache.ts).
//
// q4 (fit) currently hardcodes target = "the most-likely target role inferred
// from the resume's most-recent experience function." M4 will let users supply
// a target role/company.
//
// Prompt templates are hashed at build/test time and compared to
// lib/llm/prompts.lock.json — any drift fails the verification check, forcing
// the cache version to be bumped intentionally.

import { createHash } from 'node:crypto'

export type PerceptionQueryKey =
  | 'seniority'
  | 'technical_depth'
  | 'top_strengths'
  | 'fit'
  | 'final_round_probability'
  | 'key_credential'
  | 'missing_signal'
  | 'ai_authored'

export type PerceptionQueryShape = 'scalar' | 'list' | 'text'

export interface PerceptionQueryContext {
  target_role?: string | null
  target_company?: string | null
}

export interface PerceptionQuerySpec {
  key: PerceptionQueryKey
  shape: PerceptionQueryShape
  scalarRange?: [number, number]   // present iff shape === 'scalar'
  listLength?: number              // present iff shape === 'list'
  prompt: (resumeText: string, ctx?: PerceptionQueryContext) => string
}

const COMMON_INSTRUCTIONS = `Return ONLY a JSON object. No prose, no markdown fences.`

export const PERCEPTION_QUERIES: Record<PerceptionQueryKey, PerceptionQuerySpec> = {
  seniority: {
    key: 'seniority',
    shape: 'scalar',
    scalarRange: [1, 10],
    prompt: (t) =>
      `${COMMON_INSTRUCTIONS}\n\nRate this candidate's seniority on a 1-10 scale where 1=intern, 4=junior, 6=mid, 8=senior, 9=lead/staff, 10=executive. Base on years of experience, scope of responsibility, and demonstrated impact.\n\nReturn: {"scalar": <int 1-10>, "reasoning": "<2-4 sentences explaining your rating>"}\n\nResume:\n${t}`,
  },

  technical_depth: {
    key: 'technical_depth',
    shape: 'scalar',
    scalarRange: [1, 10],
    prompt: (t) =>
      `${COMMON_INSTRUCTIONS}\n\nRate this candidate's technical depth on a 1-10 scale. Consider: complexity of systems built, breadth and depth of technologies used, evidence of design/architecture work, contributions to open source or research.\n\nReturn: {"scalar": <int 1-10>, "reasoning": "<2-4 sentences with specific evidence from the resume>"}\n\nResume:\n${t}`,
  },

  top_strengths: {
    key: 'top_strengths',
    shape: 'list',
    listLength: 3,
    prompt: (t) =>
      `${COMMON_INSTRUCTIONS}\n\nIdentify exactly 3 strongest signals in this resume — concrete strengths a hiring manager would notice first. Be specific (avoid generic phrases like "team player" or "results-oriented").\n\nReturn: {"list": ["<strength 1>", "<strength 2>", "<strength 3>"], "reasoning": "<1-3 sentences on what unifies these>"}\n\nResume:\n${t}`,
  },

  fit: {
    key: 'fit',
    shape: 'scalar',
    scalarRange: [1, 10],
    prompt: (t, ctx) => {
      const role = ctx?.target_role?.trim()
      const company = ctx?.target_company?.trim()
      // M4: target is now a user input (was inferred-from-resume in M3).
      // When both fields are missing (legacy pre-M4 rows), fall back to the
      // M3 wording so old uploads keep working.
      const targetClause =
        role && company
          ? `The target role is ${role} at ${company}.`
          : `Assume the target role is the most-likely next-step role inferred from this candidate's most-recent experience function (e.g., a senior backend engineer's target = staff backend engineer at a similar-stage company).`
      return `${COMMON_INSTRUCTIONS}\n\n${targetClause} Rate fit for that target role on a 1-10 scale.\n\nReturn: {"scalar": <int 1-10>, "reasoning": "<2-4 sentences naming the target role and justifying the rating>"}\n\nResume:\n${t}`
    },
  },

  final_round_probability: {
    key: 'final_round_probability',
    shape: 'scalar',
    scalarRange: [0, 1],
    prompt: (t) =>
      `${COMMON_INSTRUCTIONS}\n\nEstimate the probability (0.0 to 1.0) that this resume reaches the final-round interview at a competitive company in the candidate's target function. Calibrate against the realistic top-of-funnel: most resumes do not advance.\n\nReturn: {"scalar": <float 0-1>, "reasoning": "<2-4 sentences on the calibration>"}\n\nResume:\n${t}`,
  },

  key_credential: {
    key: 'key_credential',
    shape: 'text',
    prompt: (t) =>
      `${COMMON_INSTRUCTIONS}\n\nName the single most credential-load-bearing line on this resume (the one a recruiter screens for first — could be a school, employer, certification, publication, or specific project). Quote or closely paraphrase the original line.\n\nReturn: {"text": "<the credential>", "reasoning": "<1-2 sentences on why this is the load-bearing signal>"}\n\nResume:\n${t}`,
  },

  missing_signal: {
    key: 'missing_signal',
    shape: 'text',
    prompt: (t) =>
      `${COMMON_INSTRUCTIONS}\n\nIdentify the single most damaging gap or missing signal — the one that would most lower the candidate's odds at a competitive screen. Be concrete (e.g., "no quantified impact metrics on any bullet" rather than "could be more specific").\n\nReturn: {"text": "<the gap>", "reasoning": "<1-2 sentences on the impact>"}\n\nResume:\n${t}`,
  },

  ai_authored: {
    key: 'ai_authored',
    shape: 'scalar',
    scalarRange: [0, 1],
    prompt: (t) =>
      `${COMMON_INSTRUCTIONS}\n\nEstimate the probability (0.0 to 1.0) that this resume's prose was substantially AI-authored (not just AI-polished). Consider: stylistic markers (uniform sentence rhythm, generic action verbs, parallel-structure overuse), claim density vs. specificity, and lack of idiosyncratic detail.\n\nReturn: {"scalar": <float 0-1>, "reasoning": "<2-4 sentences with specific stylistic evidence>"}\n\nResume:\n${t}`,
  },
}

export const PERCEPTION_QUERY_KEYS: PerceptionQueryKey[] = Object.keys(
  PERCEPTION_QUERIES
) as PerceptionQueryKey[]

// ---------------------------------------------------------------------------
// Prompt template hashing (build-time drift check)
// ---------------------------------------------------------------------------

// We hash with a fixed sentinel resume + sentinel target so the hash is
// stable across runs but changes whenever the template string changes.
// M4 added target_role/target_company to q4; the sentinel target ensures the
// q4 hash captures the new template branch without depending on user input.
const SENTINEL_RESUME = '__SENTINEL__'
const SENTINEL_CONTEXT = {
  target_role: '__SENTINEL_ROLE__',
  target_company: '__SENTINEL_COMPANY__',
}

export function hashPromptTemplates(): Record<PerceptionQueryKey, string> {
  const out: Partial<Record<PerceptionQueryKey, string>> = {}
  for (const key of PERCEPTION_QUERY_KEYS) {
    const rendered = PERCEPTION_QUERIES[key].prompt(SENTINEL_RESUME, SENTINEL_CONTEXT)
    out[key] = createHash('sha256').update(rendered).digest('hex').slice(0, 16)
  }
  return out as Record<PerceptionQueryKey, string>
}

// ---------------------------------------------------------------------------
// Backward-compat: M1/M2 PROMPTS map (consumed by lib/llm/analyze.ts and the
// legacy 3-LLM model clients via PROMPT_KEYS). Kept intact so save_results
// continues to write llm_responses with sane prompt_text excerpts.
// ---------------------------------------------------------------------------

import type { PromptKey } from '@/types'

export const PROMPT_KEYS: PromptKey[] = [
  'describe',
  'roles',
  'seniority',
  'skills',
  'gaps',
  'recruiter_take',
]

export const PROMPTS: Record<PromptKey, (resumeText: string) => string> = {
  describe: (t) =>
    `Review this resume and describe the candidate's background in exactly 3 sentences. Be specific and factual.\n\nResume:\n${t}`,

  roles: (t) =>
    `Review this resume and list exactly 5 specific job titles this person is most qualified for, ranked from most to least suited. Format as a numbered list with no explanation.\n\nResume:\n${t}`,

  seniority: (t) =>
    `Review this resume and assess the candidate's seniority level. Choose exactly one: Intern, Entry-level, Mid-level, Senior, Staff/Principal, Director/VP, C-level. State your choice on the first line, then explain in 1-2 sentences.\n\nResume:\n${t}`,

  skills: (t) =>
    `Review this resume and identify the candidate's 10 strongest skills based on actual evidence in their resume. Rank by demonstrated strength. Format as a numbered list with no explanation.\n\nResume:\n${t}`,

  gaps: (t) =>
    `Review this resume and identify the 3 most significant gaps or weaknesses in this candidate's profile. Be specific about what's missing and why it matters.\n\nResume:\n${t}`,

  recruiter_take: (t) =>
    `You are an experienced technical recruiter. A hiring manager just asked you about this candidate. Give your honest 3-sentence assessment. Be direct.\n\nResume:\n${t}`,
}
