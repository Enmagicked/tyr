// M9.5: Single-bullet rewrite call for the builder loop.

import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { BUILDER_SYSTEM_PROMPT, buildRewritePrompt, type BuildRewritePromptArgs } from './prompts.ts'
import { repairAndParseJson } from '@/lib/llm/perceive'
import { cacheGet, cacheSet } from '@/lib/llm/cache'

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (_client) return _client
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const CACHE_NAMESPACE = 'builder_rewrite:v2'

function rewriteCacheKey(args: BuildRewritePromptArgs): string {
  const rendered = buildRewritePrompt(args)
  const h = createHash('sha256').update(rendered).digest('hex').slice(0, 32)
  return `${CACHE_NAMESPACE}:${h}`
}

export async function rewriteBullet(args: BuildRewritePromptArgs): Promise<string> {
  const key = rewriteCacheKey(args)
  const cached = await cacheGet<{ bullet: string }>(key)
  if (cached?.bullet) return cached.bullet

  const r = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    temperature: 0.5,
    system: BUILDER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildRewritePrompt(args) }],
  })
  const text = r.content[0]?.type === 'text' ? r.content[0].text : ''
  const parsed = repairAndParseJson(text) as { bullet?: unknown } | null
  const bullet = typeof parsed?.bullet === 'string' ? parsed.bullet.trim() : ''
  if (!bullet) throw new Error('Rewrite LLM returned no bullet')
  await cacheSet(key, { bullet })
  return bullet
}
