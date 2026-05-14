import type { ParseResult, ParsedResume, ParseIssue, Education } from '@/types'
import { normalize } from './normalize'
import seedSchools from './seed-schools.json' with { type: 'json' }

// Simulates how a basic/cheap ATS works: global regex searches, no structure awareness.
// No section detection. Skills matched against a fixed keyword list.
// Intentionally limited — the divergence from Affinda and OpenResume is the insight.

interface SeedSchool {
  canonical_id: string
  display_name: string
  aliases: string[]
}

// Flattened "alias → canonical display name" map for fast scanning.
// Done once at module load. The seed list is ~60 entries — keep it conservative
// so the naive parser doesn't false-positive on coincidental substrings.
const SCHOOL_ALIASES: Array<{ alias: string; display: string }> = (() => {
  const out: Array<{ alias: string; display: string }> = []
  for (const s of (seedSchools as { entries: SeedSchool[] }).entries) {
    for (const a of s.aliases) {
      // Require at least 3 chars to skip "mit" matching in random words.
      if (a.length >= 3) out.push({ alias: a.toLowerCase(), display: s.display_name })
    }
  }
  // Longer aliases first so "harvard university" beats "harvard" on the same line.
  out.sort((a, b) => b.alias.length - a.alias.length)
  return out
})()

const KNOWN_SKILLS = [
  'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP',
  'React', 'Next.js', 'Vue', 'Angular', 'Svelte', 'Node.js', 'Express', 'FastAPI', 'Django',
  'Flask', 'Spring', 'Rails', 'Laravel', 'GraphQL', 'REST', 'gRPC',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB', 'SQLite',
  'AWS', 'GCP', 'Azure', 'Vercel', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD',
  'Git', 'GitHub', 'Linux', 'Bash', 'SQL',
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'scikit-learn', 'NLP',
  'Product Management', 'Agile', 'Scrum', 'Figma', 'Sketch', 'Jira', 'Confluence',
  'Excel', 'Tableau', 'Power BI', 'Salesforce', 'HubSpot',
  'Communication', 'Leadership', 'Project Management',
]

function scoreAndIssues(s: ParsedResume): { score: number; issues: ParseIssue[] } {
  const issues: ParseIssue[] = []
  let score = 1.0

  if (!s.name) { issues.push({ field: 'name', issue: 'Name not found', severity: 'high' }); score -= 0.15 }
  if (!s.email) { issues.push({ field: 'email', issue: 'Email not found', severity: 'high' }); score -= 0.15 }
  if (!s.phone) { issues.push({ field: 'phone', issue: 'Phone not found', severity: 'medium' }); score -= 0.10 }
  if (s.skills.length === 0) { issues.push({ field: 'skills', issue: 'No skills matched from standard keyword list', severity: 'high' }); score -= 0.30 }
  if (s.skills.length < 5) { issues.push({ field: 'skills', issue: 'Fewer than 5 skills matched — resume may understate skills', severity: 'medium' }); score -= 0.10 }

  return { score: Math.max(0, score), issues }
}

export function parseWithNaive(rawText: string): ParseResult {
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  const phoneMatch = rawText.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s][0-9]{3}[-.\s][0-9]{4}/)
  const linkedinMatch = rawText.match(/linkedin\.com\/in\/([\w-]+)/)

  // Name heuristic: first non-empty line under 60 chars with no @/digits
  const firstLine = rawText.split('\n').find((l) => {
    const t = l.trim()
    return t.length > 2 && t.length < 60 && !/@/.test(t) && !/^\d/.test(t)
  })

  const foundSkills = KNOWN_SKILLS.filter((skill) =>
    new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(rawText)
  )

  // M9.5: scan for known school names from seed-schools.json. Previously
  // naive returned education: [] always, which made the parser-agreement
  // chart read "0% agreement on Education" on every resume — misleading
  // because the asymmetry was naive-not-trying, not parsers-disagreeing.
  // Conservative match: word-boundary regex against seed aliases ≥ 3 chars.
  const lowerText = rawText.toLowerCase()
  const seenSchools = new Set<string>()
  const foundEducation: Education[] = []
  for (const { alias, display } of SCHOOL_ALIASES) {
    if (seenSchools.has(display)) continue
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lowerText)) {
      seenSchools.add(display)
      foundEducation.push({ institution: display })
    }
  }

  const structured: ParsedResume = {
    name: firstLine?.trim(),
    email: emailMatch?.[0],
    phone: phoneMatch?.[0],
    linkedin: linkedinMatch ? `linkedin.com/in/${linkedinMatch[1]}` : undefined,
    skills: foundSkills,
    experience: [],
    education: foundEducation,
    certifications: [],
    languages: [],
  }

  const { score, issues } = scoreAndIssues(structured)
  const { canonical, issues: normIssues } = normalize(structured, 'naive')

  return {
    parser_name: 'naive',
    raw_output: { matched_skills: foundSkills },
    structured_data: structured,
    canonical_data: canonical,
    normalization_issues: normIssues,
    parse_score: score,
    issues,
  }
}
