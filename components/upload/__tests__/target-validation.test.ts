// Tests for the M4 target-form validation primitives. The same `isValidTarget`
// is consumed by both the React form (gates the dropzone) and the API route
// (rejects malformed payloads), so this is genuinely the contract.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  validateTarget,
  isValidTarget,
  COMMON_ROLES,
} from '../target-validation.ts'

test('validateTarget: empty inputs → not ok, both errors', () => {
  const r = validateTarget({})
  assert.equal(r.ok, false)
  assert.ok(r.errors.target_role)
  assert.ok(r.errors.target_company)
})

test('validateTarget: 1-character inputs → too short', () => {
  const r = validateTarget({ target_role: 'A', target_company: 'B' })
  assert.equal(r.ok, false)
  assert.match(r.errors.target_role!, /at least 2/)
})

test('validateTarget: valid inputs → ok, normalized strips whitespace', () => {
  const r = validateTarget({
    target_role: '  Software Engineer  ',
    target_company: '  Google  ',
  })
  assert.equal(r.ok, true)
  assert.equal(r.normalized.target_role, 'Software Engineer')
  assert.equal(r.normalized.target_company, 'Google')
})

test('validateTarget: 81-character role → too long', () => {
  const r = validateTarget({
    target_role: 'a'.repeat(81),
    target_company: 'Google',
  })
  assert.equal(r.ok, false)
  assert.match(r.errors.target_role!, /under 80/)
})

test('validateTarget: empty after trim → too short', () => {
  const r = validateTarget({ target_role: '   ', target_company: 'Google' })
  assert.equal(r.ok, false)
})

test('isValidTarget: convenience boolean wrapper matches validateTarget.ok', () => {
  assert.equal(isValidTarget({ target_role: 'SWE', target_company: 'Google' }), true)
  assert.equal(isValidTarget({ target_role: '', target_company: '' }), false)
})

test('COMMON_ROLES: contains expected candidate-population staples', () => {
  assert.ok(COMMON_ROLES.includes('Software Engineer'))
  assert.ok(COMMON_ROLES.includes('Investment Banking Analyst'))
  assert.ok(COMMON_ROLES.includes('Product Manager'))
})

test('COMMON_ROLES: ends with the open-ended "Other" option', () => {
  assert.equal(COMMON_ROLES[COMMON_ROLES.length - 1], 'Other')
})
