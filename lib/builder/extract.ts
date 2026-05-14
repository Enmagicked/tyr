// M9.5 (post-launch fix): structured extraction of BuilderInput directly
// from a resume's raw_text. Replaces the canonical_data → BuilderInput
// mapping which was producing empty results on most resumes (canonical
// parsers don't capture projects / activities / awards, and openresume
// often misses fields). One Claude call reads the resume text and emits
// a fully-populated BuilderInput so the builder form arrives prefilled.
//
// Uses claude-haiku-4-5 for latency — this is a server-side blocking
// call on /builder?from=X page render. Sonnet would add ~3-5s; Haiku
// keeps it under 2s.

import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { cacheGet, cacheSet } from '@/lib/llm/cache'
import { repairAndParseJson } from '@/lib/llm/perceive'
import type { BuilderInput } from './types'

let _client: Anthropic | null = null
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const CACHE_NAMESPACE = 'builder_extract:v1'

const EXTRACT_PROMPT = `Read the resume text below (delimited by <resume_text>) and emit a JSON object capturing every section the candidate included. Use ONLY information that is actually present — do not invent metrics, dates, employers, schools, or technologies.

Schema:
{
  "contact": {
    "name": "<candidate's full name>",
    "email": "<email if present, else empty string>",
    "phone": "<phone if present>",
    "location": "<city/state if present>",
    "links": "<linkedin, github, portfolio URLs joined with ' · ' if present>"
  },
  "education": [
    {
      "school": "<institution name as written>",
      "degree": "<e.g. B.S., M.S., MBA, PhD>",
      "field": "<major / field of study>",
      "graduation": "<expected or actual grad date, e.g. 'May 2026'>",
      "gpa": "<GPA if present>",
      "coursework": "<comma-separated coursework if present>",
      "honors": "<honors, awards within education if present>"
    }
  ],
  "experiences": [
    {
      "role": "<job title>",
      "org": "<employer>",
      "dates": "<e.g. 'Jun 2024 — Aug 2024' or 'May 2023 — present'>",
      "location": "<if present>",
      "description": "<the bullets exactly as written, joined with newlines; do NOT rewrite, paraphrase, or add quantification that isn't in the source>"
    }
  ],
  "projects": [
    {
      "name": "<project name>",
      "tech": "<technologies / stack mentioned>",
      "link": "<URL if present>",
      "description": "<bullets / description, joined with newlines, verbatim>"
    }
  ],
  "activities": [
    {
      "name": "<club / activity / organization>",
      "role": "<role in it if mentioned>",
      "dates": "<if present>",
      "description": "<verbatim bullets / description>"
    }
  ],
  "skills": "<full skills section as a single string — preserve the candidate's own grouping (Languages: ..., Tools: ..., Frameworks: ...) when present, otherwise comma-separated>",
  "awards": "<awards section verbatim, if present>"
}

Hard rules:
- Capture EVERY section in the resume. If the resume has a "Projects" section, populate projects[]. Same for activities, awards, etc.
- Preserve original wording in descriptions / bullets — this is extraction, not rewriting. The builder will rewrite later.
- If a section is absent, return an empty array / empty string for that field — never omit a top-level key.
- Empty strings for missing optional fields (degree, gpa, location, etc.), not null.

Return ONLY the JSON object. No prose, no markdown fences.`

function extractCacheKey(rawText: string): string {
  const h = createHash('sha256').update(rawText).digest('hex').slice(0, 32)
  return `${CACHE_NAMESPACE}:${h}`
}

const MAX_INPUT_CHARS = 20_000

function truncate(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text
  const head = text.slice(0, 10_000)
  const tail = text.slice(-9_900)
  return `${head}\n\n[...resume truncated for length...]\n\n${tail}`
}

function validate(parsed: unknown): BuilderInput | null {
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>
  const contactRaw = (p.contact as Record<string, unknown> | undefined) ?? {}

  const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')
  const asArr = <T>(v: unknown, mapItem: (raw: Record<string, unknown>) => T): T[] => {
    if (!Array.isArray(v)) return []
    return v
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map(mapItem)
  }

  return {
    contact: {
      name: asStr(contactRaw.name),
      email: asStr(contactRaw.email),
      phone: asStr(contactRaw.phone),
      location: asStr(contactRaw.location),
      links: asStr(contactRaw.links),
    },
    education: asArr(p.education, (e) => ({
      school: asStr(e.school),
      degree: asStr(e.degree),
      field: asStr(e.field),
      graduation: asStr(e.graduation),
      gpa: asStr(e.gpa),
      coursework: asStr(e.coursework),
      honors: asStr(e.honors),
    })),
    experiences: asArr(p.experiences, (e) => ({
      role: asStr(e.role),
      org: asStr(e.org),
      dates: asStr(e.dates),
      location: asStr(e.location),
      description: asStr(e.description),
    })),
    projects: asArr(p.projects, (e) => ({
      name: asStr(e.name),
      tech: asStr(e.tech),
      link: asStr(e.link),
      description: asStr(e.description),
    })),
    activities: asArr(p.activities, (e) => ({
      name: asStr(e.name),
      role: asStr(e.role),
      dates: asStr(e.dates),
      description: asStr(e.description),
    })),
    skills: asStr(p.skills),
    awards: asStr(p.awards),
  }
}

export async function extractBuilderInputFromText(
  rawText: string
): Promise<BuilderInput | null> {
  if (!rawText || rawText.trim().length < 50) return null
  const client = getClient()
  if (!client) return null

  const text = truncate(rawText)
  const key = extractCacheKey(text)
  const cached = await cacheGet<BuilderInput>(key)
  if (cached) return cached

  try {
    const r = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4000,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `${EXTRACT_PROMPT}\n\n<resume_text>\n${text}\n</resume_text>`,
        },
      ],
    })
    const responseText = r.content[0]?.type === 'text' ? r.content[0].text : ''
    const parsed = repairAndParseJson(responseText)
    const validated = validate(parsed)
    if (!validated) return null
    await cacheSet(key, validated)
    return validated
  } catch (err) {
    console.warn('[builder.extract] failed:', err instanceof Error ? err.message : err)
    return null
  }
}
