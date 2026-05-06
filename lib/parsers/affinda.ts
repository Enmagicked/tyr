import { ParseResult, ParsedResume, ParseIssue } from '@/types'
import { normalize } from './normalize'

const AFFINDA_BASE = 'https://api.affinda.com/v3'

interface AffindaDocument {
  data: {
    name?: { raw?: string }
    emails?: Array<{ value?: string }>
    phoneNumbers?: Array<{ value?: string }>
    location?: { formatted?: string }
    websites?: Array<{ url?: string }>
    summary?: string
    skills?: Array<{ name?: string }>
    workExperience?: Array<{
      jobTitle?: string
      organization?: string
      dates?: { startDate?: string; endDate?: string; isCurrent?: boolean }
      jobDescription?: string
    }>
    education?: Array<{
      accreditation?: { education?: string; inputStr?: string }
      organization?: string
      dates?: { completionDate?: string }
      grade?: { value?: string }
    }>
    certifications?: string[]
    languages?: Array<{ name?: string }>
  }
}

function emptyResume(): ParsedResume {
  return {
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    languages: [],
  }
}

function failure(reason: string, severity: ParseIssue['severity'] = 'high'): ParseResult {
  const empty = emptyResume()
  const { canonical, issues: normIssues } = normalize(empty, 'affinda')
  return {
    parser_name: 'affinda',
    raw_output: null,
    structured_data: empty,
    canonical_data: canonical,
    normalization_issues: normIssues,
    parse_score: 0,
    issues: [{ field: 'parser', issue: reason, severity }],
  }
}

function mapAffindaData(raw: AffindaDocument['data']): ParsedResume {
  const linkedin = raw.websites
    ?.find((w) => w.url?.includes('linkedin.com'))
    ?.url

  return {
    name: raw.name?.raw,
    email: raw.emails?.[0]?.value,
    phone: raw.phoneNumbers?.[0]?.value,
    location: raw.location?.formatted,
    linkedin,
    summary: raw.summary,
    skills: (raw.skills ?? []).map((s) => s.name).filter(Boolean) as string[],
    experience: (raw.workExperience ?? []).map((e) => ({
      title: e.jobTitle,
      company: e.organization,
      start_date: e.dates?.startDate,
      end_date: e.dates?.endDate,
      is_current: e.dates?.isCurrent,
      description: e.jobDescription,
    })),
    education: (raw.education ?? []).map((e) => ({
      degree: e.accreditation?.education,
      institution: e.organization,
      field: e.accreditation?.inputStr,
      graduation_date: e.dates?.completionDate,
      gpa: e.grade?.value,
    })),
    certifications: raw.certifications ?? [],
    languages: (raw.languages ?? []).map((l) => l.name).filter(Boolean) as string[],
  }
}

function scoreAndIssues(s: ParsedResume): { score: number; issues: ParseIssue[] } {
  const issues: ParseIssue[] = []
  let score = 1.0

  if (!s.name) { issues.push({ field: 'name', issue: 'Name not detected', severity: 'high' }); score -= 0.15 }
  if (!s.email) { issues.push({ field: 'email', issue: 'Email not detected', severity: 'high' }); score -= 0.15 }
  if (!s.phone) { issues.push({ field: 'phone', issue: 'Phone not detected', severity: 'medium' }); score -= 0.10 }
  if (s.skills.length === 0) { issues.push({ field: 'skills', issue: 'No skills detected', severity: 'high' }); score -= 0.20 }
  if (s.experience.length === 0) { issues.push({ field: 'experience', issue: 'No work experience detected', severity: 'high' }); score -= 0.25 }
  if (s.education.length === 0) { issues.push({ field: 'education', issue: 'No education detected', severity: 'medium' }); score -= 0.15 }

  return { score: Math.max(0, score), issues }
}

export async function parseWithAffinda(fileBuffer: Buffer, fileName: string): Promise<ParseResult> {
  const apiKey = process.env.AFFINDA_API_KEY
  if (!apiKey) {
    return failure('AFFINDA_API_KEY not set; parser skipped')
  }

  const formData = new FormData()
  // Convert Buffer → Uint8Array — Buffer's ArrayBufferLike isn't a valid BlobPart in current @types/node
  formData.append('file', new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }), fileName)
  formData.append('wait', 'true')
  formData.append('compact_pdf', 'true')

  let response: Response
  try {
    response = await fetch(`${AFFINDA_BASE}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })
  } catch (err) {
    return failure(`Affinda network error: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return failure(`Affinda HTTP ${response.status}: ${text.slice(0, 300)}`)
  }

  let raw: AffindaDocument
  try {
    raw = (await response.json()) as AffindaDocument
  } catch (err) {
    return failure(`Affinda returned non-JSON: ${err instanceof Error ? err.message : String(err)}`)
  }

  const structured = mapAffindaData(raw.data)
  const { score, issues } = scoreAndIssues(structured)
  const { canonical, issues: normIssues } = normalize(structured, 'affinda')
  return {
    parser_name: 'affinda',
    raw_output: raw,
    structured_data: structured,
    canonical_data: canonical,
    normalization_issues: normIssues,
    parse_score: score,
    issues,
  }
}
