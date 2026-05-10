// Acceptance criterion 3: all 8 queries (q1-q8) defined with stable keys.
// Plus the lockfile drift check that prevents silent prompt edits from
// poisoning the Upstash cache (M3 risk #5).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  PERCEPTION_QUERIES,
  PERCEPTION_QUERY_KEYS,
  SYSTEM_PROMPT,
  getJsonSchema,
  hashPromptTemplates,
} from '../prompts.ts'

const here = dirname(fileURLToPath(import.meta.url))
const lockPath = join(here, '..', 'prompts.lock.json')

test('PERCEPTION_QUERY_KEYS contains all 8 queries q1-q8', () => {
  const expected = [
    'seniority',
    'technical_depth',
    'top_strengths',
    'fit',
    'final_round_probability',
    'key_credential',
    'missing_signal',
    'ai_authored',
  ]
  assert.deepEqual([...PERCEPTION_QUERY_KEYS].sort(), [...expected].sort())
  assert.equal(PERCEPTION_QUERY_KEYS.length, 8)
})

test('every query spec has the required fields', () => {
  for (const key of PERCEPTION_QUERY_KEYS) {
    const spec = PERCEPTION_QUERIES[key]
    assert.equal(spec.key, key, `${key}: spec.key must equal map key`)
    assert.ok(['scalar', 'list', 'text'].includes(spec.shape), `${key}: shape valid`)
    assert.equal(typeof spec.prompt, 'function', `${key}: prompt callable`)
    if (spec.shape === 'scalar') {
      assert.ok(spec.scalarRange, `${key}: scalar query needs scalarRange`)
      assert.equal(spec.scalarRange?.length, 2)
    }
    if (spec.shape === 'list') {
      assert.ok(typeof spec.listLength === 'number', `${key}: list query needs listLength`)
    }
  }
})

test('M8: every prompt wraps resume in <resume_text> delimiters and includes a Return: schema marker', () => {
  const sentinel = '__TEST_RESUME_BODY__'
  for (const key of PERCEPTION_QUERY_KEYS) {
    const rendered = PERCEPTION_QUERIES[key].prompt(sentinel)
    assert.ok(rendered.includes('<resume_text>'), `${key}: prompt must wrap resume in <resume_text> delimiter`)
    assert.ok(rendered.includes('</resume_text>'), `${key}: prompt must close the <resume_text> delimiter`)
    assert.ok(rendered.includes(sentinel), `${key}: prompt must inline the resume text`)
    assert.ok(rendered.includes('Return:'), `${key}: prompt must include the schema "Return:" stanza`)
    assert.ok(rendered.includes('"reasoning"'), `${key}: prompt must declare the reasoning field`)
  }
})

test('M8: SYSTEM_PROMPT establishes recruiter persona + injection-defense framing', () => {
  assert.ok(SYSTEM_PROMPT.length > 200, 'SYSTEM_PROMPT looks suspiciously short')
  // Persona priming
  assert.ok(/recruiter/i.test(SYSTEM_PROMPT), 'SYSTEM_PROMPT should establish recruiter persona')
  // Injection-defense paragraph (specific phrases, not just keywords —
  // these are the exact load-bearing instructions the model must see)
  assert.ok(SYSTEM_PROMPT.includes('<resume_text>'), 'SYSTEM_PROMPT must reference the delimiter')
  assert.ok(/ignore those instructions/i.test(SYSTEM_PROMPT), 'SYSTEM_PROMPT must explicitly tell the model to ignore in-resume instructions')
  // Reasoning-first instruction
  assert.ok(/reasoning.*before/i.test(SYSTEM_PROMPT), 'SYSTEM_PROMPT must instruct reasoning-first emission')
})

test('M8: SYSTEM_PROMPT does NOT leak any sentinel resume content', () => {
  // Defensive: catches accidentally template-stringing a resume into the
  // system prompt during a future refactor.
  assert.ok(!SYSTEM_PROMPT.includes('__SENTINEL'))
  assert.ok(!SYSTEM_PROMPT.includes('${'))
})

test('M8: getJsonSchema returns reasoning-first schemas with correct shape per query type', () => {
  for (const key of PERCEPTION_QUERY_KEYS) {
    const schema = getJsonSchema(key)
    assert.equal(schema.type, 'object', `${key}: schema must be object`)
    assert.equal(schema.additionalProperties, false, `${key}: must reject extra fields`)
    // Reasoning is universal
    assert.ok(schema.properties.reasoning, `${key}: schema must include reasoning property`)
    assert.ok(schema.required.includes('reasoning'), `${key}: reasoning must be required`)

    const spec = PERCEPTION_QUERIES[key]
    if (spec.shape === 'scalar') {
      assert.ok(schema.properties.scalar, `${key}: scalar schema needs scalar property`)
      assert.ok(schema.required.includes('scalar'))
    }
    if (spec.shape === 'list') {
      assert.ok(schema.properties.list, `${key}: list schema needs list property`)
      assert.ok(schema.required.includes('list'))
    }
    if (spec.shape === 'text') {
      assert.ok(schema.properties.text, `${key}: text schema needs text property`)
      assert.ok(schema.required.includes('text'))
    }
  }
})

test('scalar queries declare a sane range', () => {
  for (const key of PERCEPTION_QUERY_KEYS) {
    const spec = PERCEPTION_QUERIES[key]
    if (spec.shape !== 'scalar') continue
    const [lo, hi] = spec.scalarRange!
    assert.ok(lo < hi, `${key}: scalar range lo<hi`)
  }
})

test('lockfile drift check: live hashes match prompts.lock.json', () => {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const live = hashPromptTemplates()
  for (const key of PERCEPTION_QUERY_KEYS) {
    assert.equal(
      live[key],
      lock.hashes[key],
      `Prompt template for "${key}" changed without bumping the cache version. ` +
        `Update prompts.lock.json AND bump apeds:vN in lib/llm/perceive.ts.`
    )
  }
})

test('lockfile contains a hash for every query (no orphaned/missing entries)', () => {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const lockKeys = Object.keys(lock.hashes).sort()
  const queryKeys = [...PERCEPTION_QUERY_KEYS].sort()
  assert.deepEqual(lockKeys, queryKeys)
})
