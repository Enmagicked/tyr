// Pure normalization layer. Takes a parser's `ParsedResume` (the legacy shape)
// and produces a `CanonicalResume` plus a list of issues encountered during
// normalization. Used by the 3 parser nodes in lib/agents/parsers.ts so the
// disagreement scorer in lib/agents/disagreement.ts has a stable target to
// compare across parsers.
//
// Determinism: every helper here is a pure function of its inputs. Same input
// → same output → same hash. This is what makes acceptance criterion 3 hold.

import type {
  CanonicalContact,
  CanonicalEducation,
  CanonicalExperience,
  CanonicalResume,
  CanonicalSkill,
  DegreeNormalized,
  LevelInferred,
  NormalizationIssue,
  ParsedResume,
  ParserName,
} from '@/types'
import seedEmployers from './seed-employers.json' with { type: 'json' }
import seedSchools from './seed-schools.json' with { type: 'json' }

// ---------------------------------------------------------------------------
// Levenshtein + slug helpers
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const m = a.length
  const n = b.length
  // Two-row rolling buffer to keep memory at O(min(m, n))
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      )
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }

  return prev[n]
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  return 1 - levenshtein(a, b) / max
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function cleanCompany(s: string): string {
  // Strip common corporate suffixes (and the "&"/"and" connectors that often
  // glue them on) before matching so "Goldman Sachs Group, Inc." matches
  // "Goldman Sachs" and "Bain & Company" matches "Bain". The original raw is
  // preserved for slugify() fallbacks on long-tail firms.
  return s
    .toLowerCase()
    .replace(/[,.]/g, ' ')
    .replace(/&/g, ' ')
    .replace(/\b(inc|incorporated|corp|corporation|co|company|companies|llc|l\.l\.c\.|ltd|limited|plc|gmbh|sa|s\.a\.|ag|n\.v\.|nv|llp|l\.l\.p\.|the|group|holdings|partners)\b/g, ' ')
    .replace(/\b(and|of|for)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// URL classification
// ---------------------------------------------------------------------------

export function classifyUrl(url: string): 'linkedin' | 'github' | 'personal' {
  let host: string
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    host = u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    host = url.toLowerCase()
  }
  if (host.includes('linkedin.com')) return 'linkedin'
  if (host.includes('github.com') || host.includes('github.io')) return 'github'
  return 'personal'
}

// ---------------------------------------------------------------------------
// Date normalization
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const SEASONS: Record<string, number> = {
  spring: 4,
  summer: 6,
  fall: 9,
  autumn: 9,
  winter: 12,
}

const QUARTERS: Record<string, number> = {
  q1: 3,
  q2: 6,
  q3: 9,
  q4: 12,
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

// Returns true when the string maps to "current" (no end_iso).
export function isPresentDate(input: string): boolean {
  const t = input.trim().toLowerCase()
  return (
    t === 'present' ||
    t === 'current' ||
    t === 'currently' ||
    t === 'now' ||
    t === 'ongoing' ||
    t === 'today' ||
    t === '—' ||
    t === '-' ||
    t === '–'
  )
}

export function normalizeDate(input: string | undefined | null): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  if (isPresentDate(trimmed)) return null

  // YYYY-MM(-DD?)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/)
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10)
    const m = parseInt(isoMatch[2], 10)
    if (m >= 1 && m <= 12) return `${y}-${pad2(m)}`
  }

  // MM/YYYY  or  M/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const m = parseInt(slashMatch[1], 10)
    const y = parseInt(slashMatch[2], 10)
    if (m >= 1 && m <= 12) return `${y}-${pad2(m)}`
  }

  // MM/YYYY  with M/D/YYYY fallback (take month + year)
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdyMatch) {
    const m = parseInt(mdyMatch[1], 10)
    const y = parseInt(mdyMatch[3], 10)
    if (m >= 1 && m <= 12) return `${y}-${pad2(m)}`
  }

  // MMM YYYY  or  Month YYYY  (e.g. "Jan 2024", "January 2024", "Sept 2024")
  const monthYearMatch = trimmed.match(/^([A-Za-z]+)[.,]?\s+(\d{4})$/)
  if (monthYearMatch) {
    const monthKey = monthYearMatch[1].toLowerCase().replace(/\.$/, '')
    const y = parseInt(monthYearMatch[2], 10)
    if (MONTHS[monthKey]) return `${y}-${pad2(MONTHS[monthKey])}`
    if (SEASONS[monthKey]) return `${y}-${pad2(SEASONS[monthKey])}`
  }

  // YYYY Month  (e.g. "2024 January") — less common
  const yearMonthMatch = trimmed.match(/^(\d{4})\s+([A-Za-z]+)$/)
  if (yearMonthMatch) {
    const y = parseInt(yearMonthMatch[1], 10)
    const monthKey = yearMonthMatch[2].toLowerCase()
    if (MONTHS[monthKey]) return `${y}-${pad2(MONTHS[monthKey])}`
  }

  // Quarter notation: "Q3 2023" / "Q3, 2023" / "2023 Q3"
  const qMatch1 = trimmed.match(/^(Q[1-4])[,.]?\s+(\d{4})$/i)
  if (qMatch1) {
    const m = QUARTERS[qMatch1[1].toLowerCase()]
    return `${qMatch1[2]}-${pad2(m)}`
  }
  const qMatch2 = trimmed.match(/^(\d{4})\s+(Q[1-4])$/i)
  if (qMatch2) {
    const m = QUARTERS[qMatch2[2].toLowerCase()]
    return `${qMatch2[1]}-${pad2(m)}`
  }

  // Bare year
  const yearMatch = trimmed.match(/^(\d{4})$/)
  if (yearMatch) {
    return `${yearMatch[1]}-01`
  }

  // "Summer 2024" / "Spring 2025" — maps to canonical month
  const seasonMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (seasonMatch) {
    const seasonKey = seasonMatch[1].toLowerCase()
    const y = parseInt(seasonMatch[2], 10)
    if (SEASONS[seasonKey]) return `${y}-${pad2(SEASONS[seasonKey])}`
  }

  return null
}

// ---------------------------------------------------------------------------
// Bullet splitting
// ---------------------------------------------------------------------------

export function splitBullets(description: string | undefined | null): string[] {
  if (!description) return []
  const text = description.replace(/\r\n/g, '\n').trim()
  if (!text) return []

  // Hard-break splitters: newlines, common bullet glyphs, leading numbered prefix.
  // We split conservatively first, then sentence-split chunks > 250 chars.
  const HARD_SPLIT = /\n+|\s*[•◦▪︎●·]\s+|\s+[–—]\s+|(?:^|\n)\s*\d+[).]\s+|(?:\n|^)\s*-\s+/g

  const initial = text
    .split(HARD_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)

  const result: string[] = []
  for (const chunk of initial) {
    if (chunk.length <= 250) {
      result.push(chunk)
      continue
    }
    // Split on sentence boundaries — period/!/? followed by whitespace + capital,
    // OR semicolon. Keeps behavior conservative: only fires when chunk is long.
    const sentences = chunk
      .split(/(?<=[.!?])\s+(?=[A-Z])|;\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (sentences.length > 1) {
      result.push(...sentences)
    } else {
      result.push(chunk)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Employer / school canonicalization
// ---------------------------------------------------------------------------

interface SeedEntry {
  canonical_id: string
  display_name: string
  aliases: string[]
}

const EMPLOYER_ENTRIES: SeedEntry[] = (seedEmployers as { entries: SeedEntry[] }).entries
const SCHOOL_ENTRIES: SeedEntry[] = (seedSchools as { entries: SeedEntry[] }).entries

function canonicalizeAgainst(raw: string, entries: SeedEntry[], threshold = 0.85): string | null {
  const cleaned = cleanCompany(raw)
  if (!cleaned) return null

  // Exact alias match wins (cheap path)
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      if (cleaned === alias) return entry.canonical_id
    }
  }

  // Fuzzy match
  let best: { id: string; score: number } | null = null
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      const score = similarity(cleaned, alias)
      if (score >= threshold && (!best || score > best.score)) {
        best = { id: entry.canonical_id, score }
      }
    }
  }
  return best?.id ?? null
}

export function canonicalizeEmployer(raw: string): string {
  if (!raw) return ''
  const matched = canonicalizeAgainst(raw, EMPLOYER_ENTRIES)
  if (matched) return matched
  return slugify(raw)
}

export function canonicalizeSchool(raw: string): string {
  if (!raw) return ''
  const matched = canonicalizeAgainst(raw, SCHOOL_ENTRIES)
  if (matched) return matched
  return slugify(raw)
}

// ---------------------------------------------------------------------------
// Degree + level inference
// ---------------------------------------------------------------------------

export function normalizeDegree(raw: string | undefined): DegreeNormalized | undefined {
  if (!raw) return undefined
  const t = raw.toLowerCase()
  if (/\b(ph\.?d\.?|doctor of philosophy|doctorate)\b/.test(t)) return 'PhD'
  if (/\b(j\.?d\.?|juris doctor)\b/.test(t)) return 'JD'
  if (/\b(m\.?d\.?|doctor of medicine)\b/.test(t)) return 'MD'
  if (/\b(m\.?b\.?a\.?|master of business)\b/.test(t)) return 'MBA'
  if (/\b(m\.?s\.?|master of science|m\.?sc\.?)\b/.test(t)) return 'MS'
  if (/\b(m\.?a\.?|master of arts)\b/.test(t)) return 'MA'
  if (/\b(b\.?s\.?|bachelor of science|b\.?sc\.?)\b/.test(t)) return 'BS'
  if (/\b(b\.?a\.?|bachelor of arts|a\.?b\.?)\b/.test(t)) return 'BA'
  if (/\b(bachelor|master|associate|doctor)\b/.test(t)) return 'other'
  return undefined
}

export function inferLevel(title: string): LevelInferred | undefined {
  if (!title) return undefined
  const t = title.toLowerCase()
  if (/\b(intern|internship|co[\s-]?op)\b/.test(t)) return 'intern'
  if (/\b(chief|cto|cfo|ceo|coo|cpo|vp|vice president|president|founder|partner|managing director|head of)\b/.test(t)) return 'exec'
  if (/\b(staff|principal|distinguished)\b/.test(t)) return 'lead'
  if (/\b(lead|tech lead|team lead|manager|director)\b/.test(t)) return 'lead'
  if (/\b(senior|sr\.?|sr )/.test(t)) return 'senior'
  if (/\b(junior|jr\.?|jr |associate|entry)\b/.test(t)) return 'junior'
  return 'mid'
}

// ---------------------------------------------------------------------------
// Skill normalization
// ---------------------------------------------------------------------------

const SKILL_ALIASES: Record<string, string> = {
  'js': 'JavaScript',
  'javascript': 'JavaScript',
  'ts': 'TypeScript',
  'typescript': 'TypeScript',
  'py': 'Python',
  'python': 'Python',
  'k8s': 'Kubernetes',
  'kubernetes': 'Kubernetes',
  'gcp': 'Google Cloud',
  'google cloud': 'Google Cloud',
  'aws': 'AWS',
  'azure': 'Azure',
  'pg': 'PostgreSQL',
  'postgres': 'PostgreSQL',
  'postgresql': 'PostgreSQL',
  'mongo': 'MongoDB',
  'mongodb': 'MongoDB',
  'tf': 'TensorFlow',
  'tensorflow': 'TensorFlow',
  'pytorch': 'PyTorch',
  'sklearn': 'scikit-learn',
  'scikit-learn': 'scikit-learn',
  'nextjs': 'Next.js',
  'next.js': 'Next.js',
  'reactjs': 'React',
  'react.js': 'React',
  'react': 'React',
  'nodejs': 'Node.js',
  'node.js': 'Node.js',
  'node': 'Node.js',
  'ml': 'Machine Learning',
  'machine learning': 'Machine Learning',
  'dl': 'Deep Learning',
  'deep learning': 'Deep Learning',
  'nlp': 'NLP',
}

function normalizeSkillName(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (SKILL_ALIASES[t]) return SKILL_ALIASES[t]
  return raw.trim()
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

function emptyCanonical(): CanonicalResume {
  return {
    contact: { personal_urls: [] },
    education: [],
    experience: [],
    skills: [],
  }
}

export function normalize(
  raw: ParsedResume,
  parserName: ParserName
): { canonical: CanonicalResume; issues: NormalizationIssue[] } {
  const issues: NormalizationIssue[] = []
  const canonical = emptyCanonical()
  canonical.name = raw.name?.trim() || undefined

  // Contact ----------------------------------------------------------------
  const contact: CanonicalContact = { personal_urls: [] }
  contact.email = raw.email?.trim() || undefined
  contact.phone = raw.phone?.trim() || undefined

  const urls: string[] = []
  if (raw.linkedin) urls.push(raw.linkedin)
  // openresume currently writes only `linkedin`. naive too. Affinda goes through
  // raw.websites in the affinda normalizer — those flow into raw.linkedin only
  // when they look like LinkedIn. Personal URLs from Affinda surface in
  // structured_data via separate fields if the parser picks them up; for now
  // we only have raw.linkedin, but be ready for future parser additions that
  // populate structured_data with extra urls.
  for (const u of urls) {
    if (!u) continue
    const kind = classifyUrl(u)
    if (kind === 'linkedin' && !contact.linkedin_url) contact.linkedin_url = u
    else if (kind === 'github' && !contact.github_url) contact.github_url = u
    else contact.personal_urls.push(u)
  }
  canonical.contact = contact

  if (!contact.email) {
    issues.push({ field: 'contact.email', reason: 'missing email', severity: 'medium' })
  }

  // Education --------------------------------------------------------------
  for (const edu of raw.education ?? []) {
    const school = (edu.institution ?? '').trim()
    const ent: CanonicalEducation = {
      school_canonical_id: school ? canonicalizeSchool(school) : '',
      school_raw: school,
      degree_normalized: normalizeDegree(edu.degree),
      field: edu.field?.trim() || undefined,
    }
    if (edu.graduation_date) {
      const iso = normalizeDate(edu.graduation_date)
      if (iso) {
        ent.end_iso = iso
      } else {
        issues.push({
          field: 'education.graduation_date',
          reason: `unparseable date for ${parserName}`,
          raw_value: edu.graduation_date,
          severity: 'low',
        })
      }
    }
    if (edu.gpa) {
      const num = parseFloat(edu.gpa)
      if (!Number.isNaN(num)) ent.gpa = num
    }
    if (school) canonical.education.push(ent)
  }

  // Experience -------------------------------------------------------------
  for (const exp of raw.experience ?? []) {
    const employer = (exp.company ?? '').trim()
    const title = (exp.title ?? '').trim()
    const bullets = splitBullets(exp.description)

    const startIso = exp.start_date ? normalizeDate(exp.start_date) : null
    const endIso = exp.end_date ? normalizeDate(exp.end_date) : null
    const isCurrent = exp.is_current === true || (exp.end_date ? isPresentDate(exp.end_date) : false)

    if (exp.start_date && !startIso) {
      issues.push({
        field: 'experience.start_date',
        reason: `unparseable date for ${parserName}`,
        raw_value: exp.start_date,
        severity: 'low',
      })
    }
    if (exp.end_date && !endIso && !isCurrent) {
      issues.push({
        field: 'experience.end_date',
        reason: `unparseable date for ${parserName}`,
        raw_value: exp.end_date,
        severity: 'low',
      })
    }

    const ent: CanonicalExperience = {
      employer_canonical_id: employer ? canonicalizeEmployer(employer) : '',
      employer_raw: employer,
      title_raw: title,
      level_inferred: inferLevel(title),
      start_iso: startIso ?? undefined,
      end_iso: isCurrent ? undefined : endIso ?? undefined,
      bullets,
      bullet_count: bullets.length,
      char_count: bullets.reduce((acc, b) => acc + b.length, 0),
    }
    if (employer || title) canonical.experience.push(ent)
  }

  // Skills -----------------------------------------------------------------
  const seen = new Set<string>()
  for (const s of raw.skills ?? []) {
    const norm = normalizeSkillName(s)
    const key = norm.toLowerCase()
    if (!norm || seen.has(key)) continue
    seen.add(key)
    canonical.skills.push({ name_canonical: norm, source: 'self' })
  }

  return { canonical, issues }
}

// Test-only exports — kept small surface to satisfy the disagreement scorer
// and unit tests in lib/parsers/__tests__/.
export const __TEST__ = {
  cleanCompany,
  similarity,
  slugify,
  EMPLOYER_ENTRIES,
  SCHOOL_ENTRIES,
}
