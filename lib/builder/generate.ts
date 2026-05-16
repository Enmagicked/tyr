// M9.5: Claude resume generation for the builder. Single call returns a
// structured JSON resume that the analyzer pipeline can score and the UI
// can render with surgical bullet rewrites.

import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import {
  BUILDER_SYSTEM_PROMPT,
  buildGenerationPrompt,
  type BuildGenPromptArgs,
} from './prompts.ts'
import { repairAndParseJson } from '@/lib/llm/perceive'
import { cacheGet, cacheSet } from '@/lib/llm/cache'
import type { GeneratedResume } from './types.ts'

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (_client) return _client
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

// Cache namespace — bump on prompt template change (see prompts.lock.json).
const CACHE_NAMESPACE = 'builder:v2'

function generationCacheKey(args: BuildGenPromptArgs): string {
  const rendered = buildGenerationPrompt(args)
  const h = createHash('sha256').update(rendered).digest('hex').slice(0, 32)
  return `${CACHE_NAMESPACE}:${h}`
}

function validate(parsed: unknown): GeneratedResume | null {
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>
  if (typeof p.name !== 'string') return null
  if (typeof p.contact_line !== 'string') return null
  if (!Array.isArray(p.sections)) return null

  const sections = p.sections
    .map((sRaw) => {
      if (!sRaw || typeof sRaw !== 'object') return null
      const s = sRaw as Record<string, unknown>
      if (typeof s.heading !== 'string') return null
      if (!Array.isArray(s.items)) return null
      const items = s.items
        .map((iRaw) => {
          if (!iRaw || typeof iRaw !== 'object') return null
          const i = iRaw as Record<string, unknown>
          if (typeof i.header !== 'string') return null
          if (!Array.isArray(i.bullets)) return null
          const bullets = i.bullets.filter((b): b is string => typeof b === 'string')
          return { header: i.header, bullets }
        })
        .filter((x): x is { header: string; bullets: string[] } => x !== null)
      return { heading: s.heading, items }
    })
    .filter(
      (x): x is { heading: string; items: { header: string; bullets: string[] }[] } =>
        x !== null
    )

  if (sections.length === 0) return null

  return {
    name: p.name,
    contact_line: p.contact_line,
    sections,
  }
}

export async function generateResume(
  args: BuildGenPromptArgs,
  insightsAddendum = ''
): Promise<GeneratedResume> {
  // Insights addendum is part of the cache key so rebuilds from different
  // source resumes (or no source) produce distinct cache entries.
  const key = generationCacheKey(args) + (insightsAddendum
    ? `:${createHash('sha256').update(insightsAddendum).digest('hex').slice(0, 12)}`
    : '')
  const cached = await cacheGet<GeneratedResume>(key)
  if (cached) return cached

  const prompt = buildGenerationPrompt(args) + insightsAddendum
  const r = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    temperature: 0.4,
    system: BUILDER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = r.content[0]?.type === 'text' ? r.content[0].text : ''
  const parsed = repairAndParseJson(text)
  const validated = validate(parsed)
  if (!validated) {
    throw new Error('Builder LLM returned an invalid resume shape')
  }
  await cacheSet(key, validated)
  return validated
}
