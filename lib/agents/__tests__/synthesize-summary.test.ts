// M6: lockfile drift check for the synthesize_summary prompt template.
// Mirrors lib/llm/__tests__/prompts.test.ts. If you edit buildPrompt() in
// synthesize-summary.ts, this test fails until you (a) regenerate the hash
// in synthesize-summary.lock.json AND (b) bump the cache namespace
// (apeds_summary:vN → vN+1) in synthesize-summary.ts. The double-bump rule
// is what prevents a silent prompt edit from poisoning the Upstash cache.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Import directly from the prompt module so the test resolver doesn't need to
// follow the LLM cache + Anthropic SDK transitive imports of the graph node.
import { hashSummaryPromptTemplate } from '../synthesize-summary-prompt.ts'

const here = dirname(fileURLToPath(import.meta.url))
const lockPath = join(here, '..', 'synthesize-summary.lock.json')

test('synthesize_summary lockfile: live hash matches synthesize-summary.lock.json', () => {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
    version: string
    hashes: { buildPrompt: string }
  }
  const live = hashSummaryPromptTemplate()
  assert.equal(
    live,
    lock.hashes.buildPrompt,
    `synthesize_summary buildPrompt() changed without bumping the cache version.\n` +
      `  live hash:    ${live}\n` +
      `  lockfile:     ${lock.hashes.buildPrompt}\n` +
      `Update synthesize-summary.lock.json AND bump apeds_summary:vN in synthesize-summary.ts.`
  )
})
