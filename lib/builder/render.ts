// M9.5: GeneratedResume → plain-text rendering. The plain-text form is what
// the perception graph scores (via resumes.raw_text) and what the print PDF
// reflects. Keep the rendering deterministic so re-scoring after a bullet
// rewrite produces a comparable input.

import type { GeneratedResume } from './types.ts'

export function renderResumeText(resume: GeneratedResume): string {
  const lines: string[] = []
  lines.push(resume.name)
  if (resume.contact_line) lines.push(resume.contact_line)
  for (const section of resume.sections) {
    lines.push('')
    lines.push(section.heading.toUpperCase())
    for (const item of section.items) {
      lines.push(item.header)
      for (const bullet of item.bullets) {
        lines.push(`- ${bullet}`)
      }
    }
  }
  return lines.join('\n')
}
