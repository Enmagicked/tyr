// Golden set for acceptance criterion 7. Each pair must canonicalize to the
// same id, and no false-positive collisions.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { canonicalizeEmployer } from '../normalize.ts'

const EQUIV_GROUPS: Array<[string, string[]]> = [
  ['jpmorgan-chase', ['JPM', 'JPMorgan', 'JPMorgan Chase', 'JPMorgan Chase & Co.', 'J.P. Morgan']],
  ['goldman-sachs', ['Goldman Sachs', 'Goldman Sachs Group', 'GS']],
  ['morgan-stanley', ['Morgan Stanley', 'MS', 'MorganStanley']],
  ['google', ['Google', 'Google LLC', 'Alphabet', 'Alphabet Inc.']],
  ['meta', ['Meta', 'Meta Platforms', 'Facebook', 'Facebook, Inc.']],
  ['mckinsey', ['McKinsey', 'McKinsey & Company']],
  ['bcg', ['BCG', 'Boston Consulting Group']],
  ['bain', ['Bain', 'Bain & Company']],
  ['amazon', ['Amazon', 'Amazon.com', 'AWS', 'Amazon Web Services']],
  ['blackstone', ['Blackstone', 'Blackstone Group']],
]

for (const [expected, names] of EQUIV_GROUPS) {
  test(`employers: ${expected} group canonicalizes consistently`, () => {
    const ids = names.map(canonicalizeEmployer)
    for (const id of ids) {
      assert.equal(id, expected, `expected all of ${JSON.stringify(names)} → ${expected}, got ${JSON.stringify(ids)}`)
    }
  })
}

test('employers: unknown firm slugifies, does not collide', () => {
  assert.equal(canonicalizeEmployer('Acme Widgets, Inc.'), 'acme-widgets-inc')
})

test('employers: distinct firms do not collide', () => {
  const goldman = canonicalizeEmployer('Goldman Sachs')
  const morgan = canonicalizeEmployer('Morgan Stanley')
  assert.notEqual(goldman, morgan)
})

test('employers: 20-row golden set total coverage', () => {
  // Acceptance criterion 7 — count: ≥ 20 rows in the golden set.
  let total = 0
  for (const [, names] of EQUIV_GROUPS) total += names.length
  assert.ok(total >= 20, `golden set has ${total} rows, must be ≥ 20`)
})
