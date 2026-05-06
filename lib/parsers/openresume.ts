import type { ParseResult, ParsedResume, ParseIssue, WorkExperience, Education } from '@/types'
import { normalize } from './normalize'

// Section-aware parser. Detects common resume section headers and parses each
// section with targeted patterns — more accurate than global search but less
// sophisticated than Affinda's ML approach.

const SECTION_HEADERS: Record<string, RegExp> = {
  summary: /^(SUMMARY|PROFESSIONAL SUMMARY|OBJECTIVE|PROFILE|ABOUT ME?)\s*$/im,
  experience: /^(WORK EXPERIENCE|EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT|WORK HISTORY|CAREER)\s*$/im,
  education: /^(EDUCATION|ACADEMIC BACKGROUND|ACADEMIC HISTORY|QUALIFICATIONS)\s*$/im,
  skills: /^(SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|KEY SKILLS|TECHNOLOGIES|EXPERTISE|TECH STACK)\s*$/im,
  certifications: /^(CERTIFICATIONS|CERTIFICATES|CREDENTIALS|LICENSES|AWARDS)\s*$/im,
}

function splitIntoSections(text: string): Record<string, string> {
  const lines = text.split('\n')
  const sections: Record<string, string> = { header: '' }
  let current = 'header'

  for (const line of lines) {
    let matched = false
    for (const [name, pattern] of Object.entries(SECTION_HEADERS)) {
      if (pattern.test(line.trim())) {
        current = name
        sections[name] = ''
        matched = true
        break
      }
    }
    if (!matched) {
      sections[current] = (sections[current] ?? '') + line + '\n'
    }
  }

  return sections
}

function extractContactFromHeader(header: string): Partial<ParsedResume> {
  const emailMatch = header.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  const phoneMatch = header.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s][0-9]{3}[-.\s][0-9]{4}/)
  const linkedinMatch = header.match(/(?:linkedin\.com\/in\/)([\w-]+)/)
  const lines = header.trim().split('\n').filter(Boolean)
  const name = lines[0]?.trim()

  return {
    name: name && name.length < 60 ? name : undefined,
    email: emailMatch?.[0],
    phone: phoneMatch?.[0],
    linkedin: linkedinMatch ? `linkedin.com/in/${linkedinMatch[1]}` : undefined,
  }
}

function extractSkills(section: string): string[] {
  return section
    .split(/[,|\n•·]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 50)
}

function extractExperience(section: string): WorkExperience[] {
  const experiences: WorkExperience[] = []
  // Each job block typically starts with a title/company line followed by dates
  const datePattern = /(\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i
  const blocks = section.split(/\n(?=[A-Z])/g).filter((b) => b.trim().length > 20)

  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean)
    if (lines.length < 2) continue

    const hasDate = lines.slice(0, 3).some((l) => datePattern.test(l))
    if (!hasDate) continue

    const dateLine = lines.find((l) => datePattern.test(l)) ?? ''
    const dateMatch = dateLine.match(/(\w+ \d{4}|\d{4})\s*[-–—]\s*(\w+ \d{4}|\d{4}|Present|Current)/i)

    experiences.push({
      title: lines[0]?.trim(),
      company: lines[1]?.trim(),
      start_date: dateMatch?.[1],
      end_date: dateMatch?.[2],
      is_current: /present|current/i.test(dateLine),
      description: lines.slice(2).join(' ').trim(),
    })
  }

  return experiences
}

function extractEducation(section: string): Education[] {
  const items: Education[] = []
  const blocks = section.split(/\n(?=[A-Z])/g).filter((b) => b.trim().length > 10)

  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean)
    if (lines.length < 1) continue

    const yearMatch = block.match(/\b(19|20)\d{2}\b/)
    const gpaMatch = block.match(/GPA[:\s]+([0-9.]+)/i)
    const degreeKeywords = /\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?B\.?A\.?|Ph\.?D\.?|Bachelor|Master|Associate|Doctor)\b/i
    const degreeMatch = block.match(degreeKeywords)

    items.push({
      degree: degreeMatch?.[0],
      institution: lines[0]?.trim(),
      graduation_date: yearMatch?.[0],
      gpa: gpaMatch?.[1],
    })
  }

  return items
}

function scoreAndIssues(s: ParsedResume): { score: number; issues: ParseIssue[] } {
  const issues: ParseIssue[] = []
  let score = 1.0

  if (!s.name) { issues.push({ field: 'name', issue: 'Name not detected — may be an image or unusual formatting', severity: 'high' }); score -= 0.15 }
  if (!s.email) { issues.push({ field: 'email', issue: 'Email not detected', severity: 'high' }); score -= 0.15 }
  if (!s.phone) { issues.push({ field: 'phone', issue: 'Phone not detected', severity: 'medium' }); score -= 0.10 }
  if (s.skills.length === 0) { issues.push({ field: 'skills', issue: 'No skills section detected — add a clear "Skills" header', severity: 'high' }); score -= 0.20 }
  if (s.experience.length === 0) { issues.push({ field: 'experience', issue: 'Work experience section not parsed — check section header formatting', severity: 'high' }); score -= 0.25 }
  if (s.education.length === 0) { issues.push({ field: 'education', issue: 'Education section not parsed', severity: 'medium' }); score -= 0.15 }

  return { score: Math.max(0, score), issues }
}

export function parseWithOpenResume(rawText: string): ParseResult {
  const sections = splitIntoSections(rawText)
  const contact = extractContactFromHeader(sections.header ?? rawText.slice(0, 500))

  const structured: ParsedResume = {
    ...contact,
    summary: sections.summary?.trim() || undefined,
    skills: sections.skills ? extractSkills(sections.skills) : [],
    experience: sections.experience ? extractExperience(sections.experience) : [],
    education: sections.education ? extractEducation(sections.education) : [],
    certifications: sections.certifications
      ? sections.certifications.split('\n').map((s) => s.trim()).filter(Boolean)
      : [],
    languages: [],
  }

  const { score, issues } = scoreAndIssues(structured)
  const { canonical, issues: normIssues } = normalize(structured, 'openresume')

  return {
    parser_name: 'openresume',
    raw_output: sections,
    structured_data: structured,
    canonical_data: canonical,
    normalization_issues: normIssues,
    parse_score: score,
    issues,
  }
}
