import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { hashBuilderTemplates, buildGenerationPrompt, buildRewritePrompt } from '../prompts.ts'
import type { BuilderInput } from '../types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const lockPath = join(here, '..', 'prompts.lock.json')

test('builder lockfile drift: live hashes match prompts.lock.json', () => {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
    hashes: { generation: string; rewrite: string; system: string }
  }
  const live = hashBuilderTemplates()
  assert.equal(live.generation, lock.hashes.generation, 'generation prompt changed — regen lockfile and bump builder:vN in generate.ts')
  assert.equal(live.rewrite, lock.hashes.rewrite, 'rewrite prompt changed — regen lockfile and bump builder_rewrite:vN in rewrite.ts')
  assert.equal(live.system, lock.hashes.system, 'BUILDER_SYSTEM_PROMPT changed — regen lockfile and bump both cache namespaces')
})

test('generation prompt includes internship cue when isInternship=true', () => {
  const minimalInput: BuilderInput = {
    contact: { name: 'X', email: 'x@y.com' },
    education: [],
    experiences: [],
    projects: [],
    activities: [],
    skills: '',
  }
  const rendered = buildGenerationPrompt({
    input: minimalInput,
    targetRole: 'SWE Intern',
    targetCompany: null,
    targetJd: null,
    isInternship: true,
  })
  assert.ok(/INTERNSHIP/i.test(rendered), 'must surface internship calibration when on')
})

test('rewrite prompt forbids invented metrics + clichés', () => {
  const rendered = buildRewritePrompt({
    originalBullet: 'Built a thing',
    itemHeader: 'SWE Intern · Foo · 2024',
    targetRole: null,
    targetJd: null,
    isInternship: false,
  })
  assert.ok(/fabricate/i.test(rendered) || /do not.*invent/i.test(rendered))
  assert.ok(/clich/i.test(rendered))
  assert.ok(rendered.includes('Built a thing'), 'must include the original bullet')
})
