// Cross-parser disagreement scoring. Pairwise over the canonical outputs of
// the 2–3 surviving parsers; emits a per-resume aggregate that the report page
// renders as "Parser agreement: X%".
//
// Design notes:
//   - Set-valued fields (skills, personal_urls): 1 - jaccard(A, B)
//   - Scalar text (name, email, phone): normalized edit distance
//   - Experience alignment: bipartite match on (employer_canonical_id, start_iso)
//     tuples, then matched / max(|A|, |B|)
//   - 0 parsers → caller skips writing a row (handled in save_results)
//   - 1 parser  → row written with overall_score = null, parser_pair_diffs = []
//   - 2-3 parsers → full pairwise via lib/disagreement/pairwise.ts (M3 refactor)

import type { CanonicalResume, ParseResult } from '@/types'
import { pairwiseDisagreement, type PairwiseConfig } from '../disagreement/pairwise.ts'

export interface ParserPairDiff {
  parser_a: string
  parser_b: string
  field_disagreement: Record<string, number> // 0=identical, 1=fully different
  experience_alignment: number // 0..1, bipartite match fraction
  bullet_count_diff: number
}

export interface DisagreementResult {
  field_disagreement: Record<string, number> // mean over pairs
  experience_alignment: number | null // mean over pairs; null when <2 parsers
  bullet_count_variance: number // variance across parsers per matched experience
  overall_score: number | null // weighted aggregate ∈ [0,1]; null when <2 parsers
  parser_pair_diffs: ParserPairDiff[]
  parser_count: number
}

// ---------------------------------------------------------------------------
// String similarity (shared with normalize but kept local to keep this module
// independent — no risk of accidental coupling between parser- and graph-level
// utilities).
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  const m = a.length
  const n = b.length
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }
  return prev[n]
}

function normalizedEditDistance(a: string, b: string): number {
  if (!a && !b) return 0
  const max = Math.max(a.length, b.length)
  if (max === 0) return 0
  return levenshtein(a, b) / max
}

function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  if (union === 0) return 0
  return 1 - inter / union
}

// ---------------------------------------------------------------------------
// Pairwise diff
// ---------------------------------------------------------------------------

function lowerSet(values: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const v of values) {
    if (v) out.add(v.trim().toLowerCase())
  }
  return out
}

function strOrEmpty(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

// Bipartite matching: greedy on (employer_canonical_id, start_iso) tuples is
// sufficient at the scale of one resume (<= ~20 experiences). Not optimal in
// general but the score is bounded and stable.
function experienceAlignment(a: CanonicalResume, b: CanonicalResume): number {
  const aExp = a.experience
  const bExp = b.experience
  if (aExp.length === 0 && bExp.length === 0) return 1
  if (aExp.length === 0 || bExp.length === 0) return 0

  const used = new Set<number>()
  let matched = 0

  for (const ea of aExp) {
    let bestIdx = -1
    let bestScore = 0
    for (let j = 0; j < bExp.length; j++) {
      if (used.has(j)) continue
      const eb = bExp[j]

      const employerSame =
        !!ea.employer_canonical_id &&
        ea.employer_canonical_id === eb.employer_canonical_id
      const startSame =
        !!ea.start_iso && ea.start_iso === eb.start_iso

      // Score: 1.0 = both match; 0.6 = employer match only; 0.4 = start match
      // only (employer canonicalization can fail on long-tail firms — don't
      // penalize when start dates align across parsers).
      let score = 0
      if (employerSame && startSame) score = 1.0
      else if (employerSame) score = 0.6
      else if (startSame) score = 0.4

      if (score > bestScore) {
        bestScore = score
        bestIdx = j
      }
    }
    if (bestScore >= 0.6 && bestIdx >= 0) {
      used.add(bestIdx)
      matched += 1
    }
  }

  return matched / Math.max(aExp.length, bExp.length)
}

function bulletCountDiff(a: CanonicalResume, b: CanonicalResume): number {
  // Sum-of-absolute-differences over matched experiences. We use index pairing
  // up to min length — coarse, but the per-resume aggregate later takes
  // variance which is the actual signal.
  const n = Math.min(a.experience.length, b.experience.length)
  let total = 0
  for (let i = 0; i < n; i++) {
    total += Math.abs(a.experience[i].bullet_count - b.experience[i].bullet_count)
  }
  return total
}

// Field-level metric configuration consumed by the generic pairwise helper.
// Keys here become `field_disagreement` map keys in DisagreementResult.
const FIELD_METRICS: PairwiseConfig<CanonicalResume> = {
  scalarMetrics: {
    name: (a, b) => normalizedEditDistance(strOrEmpty(a.name), strOrEmpty(b.name)),
    email: (a, b) => normalizedEditDistance(strOrEmpty(a.contact.email), strOrEmpty(b.contact.email)),
    phone: (a, b) => normalizedEditDistance(strOrEmpty(a.contact.phone), strOrEmpty(b.contact.phone)),
    linkedin_url: (a, b) =>
      normalizedEditDistance(strOrEmpty(a.contact.linkedin_url), strOrEmpty(b.contact.linkedin_url)),
    github_url: (a, b) =>
      normalizedEditDistance(strOrEmpty(a.contact.github_url), strOrEmpty(b.contact.github_url)),
  },
  setMetrics: {
    personal_urls: (a, b) =>
      jaccardDistance(lowerSet(a.contact.personal_urls), lowerSet(b.contact.personal_urls)),
    skills: (a, b) =>
      jaccardDistance(
        lowerSet(a.skills.map((s) => s.name_canonical)),
        lowerSet(b.skills.map((s) => s.name_canonical))
      ),
    education: (a, b) =>
      jaccardDistance(
        lowerSet(a.education.map((e) => e.school_canonical_id).filter((x): x is string => !!x)),
        lowerSet(b.education.map((e) => e.school_canonical_id).filter((x): x is string => !!x))
      ),
  },
}

export function pairwise(a: CanonicalResume, b: CanonicalResume): {
  field_disagreement: Record<string, number>
  experience_alignment: number
  bullet_count_diff: number
} {
  const { pairs } = pairwiseDisagreement(
    [
      { source: 'a', value: a },
      { source: 'b', value: b },
    ],
    FIELD_METRICS
  )
  return {
    field_disagreement: pairs[0].metrics,
    experience_alignment: experienceAlignment(a, b),
    bullet_count_diff: bulletCountDiff(a, b),
  }
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

function variance(nums: number[]): number {
  if (nums.length === 0) return 0
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length
  return nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length
}

function meanOf(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function computeDisagreementFromCanonicals(
  parsers: Array<{ name: string; canonical: CanonicalResume }>
): DisagreementResult {
  if (parsers.length < 2) {
    return {
      field_disagreement: {},
      experience_alignment: null,
      bullet_count_variance: 0,
      overall_score: null,
      parser_pair_diffs: [],
      parser_count: parsers.length,
    }
  }

  // Generic helper computes per-field pairwise + aggregate. Experience alignment
  // and bullet-count diff stay local because they're not (a,b)→number metrics
  // — they have a richer return shape (alignment fraction is structural).
  const items = parsers.map((p) => ({ source: p.name, value: p.canonical }))
  const fieldResult = pairwiseDisagreement(items, FIELD_METRICS)

  const pairs: ParserPairDiff[] = []
  for (let i = 0; i < parsers.length; i++) {
    for (let j = i + 1; j < parsers.length; j++) {
      const a = parsers[i]
      const b = parsers[j]
      const fieldEntry = fieldResult.pairs.find(
        (p) => p.a === a.name && p.b === b.name
      )!
      pairs.push({
        parser_a: a.name,
        parser_b: b.name,
        field_disagreement: fieldEntry.metrics,
        experience_alignment: experienceAlignment(a.canonical, b.canonical),
        bullet_count_diff: bulletCountDiff(a.canonical, b.canonical),
      })
    }
  }

  const expAlign = meanOf(pairs.map((p) => p.experience_alignment))

  // Bullet-count variance across parsers, per matched experience index — we use
  // the cross-parser variance of bullet_count for experiences at index k.
  // Simple approximation: take variance of per-pair bullet_count_diff values.
  const bcVar = variance(pairs.map((p) => p.bullet_count_diff))

  const meanFieldDisagreement = meanOf(Object.values(fieldResult.aggregate))
  const overall =
    0.4 * meanFieldDisagreement +
    0.4 * (1 - expAlign) +
    0.2 * Math.min(1, bcVar / 5)

  return {
    field_disagreement: fieldResult.aggregate,
    experience_alignment: expAlign,
    bullet_count_variance: bcVar,
    overall_score: clamp01(overall),
    parser_pair_diffs: pairs,
    parser_count: parsers.length,
  }
}

// Helper for the graph node — accepts the raw ParseResult[] from `parse_resume`.
export function computeDisagreementFromResults(
  results: ParseResult[]
): DisagreementResult {
  const parsers = results.map((r) => ({
    name: r.parser_name,
    canonical: r.canonical_data,
  }))
  return computeDisagreementFromCanonicals(parsers)
}
