// Unit tests for lib/parsers/normalize.ts. Uses Node 20+ built-in test runner
// (`node:test`) so no extra dev dependency is required. Run with:
//   npx tsx --test lib/parsers/__tests__/*.test.ts
// or compile + run with `node --test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyUrl,
  normalizeDate,
  splitBullets,
  isPresentDate,
  normalizeDegree,
  inferLevel,
  canonicalizeSchool,
} from '../normalize.ts'

test('classifyUrl: linkedin', () => {
  assert.equal(classifyUrl('https://www.linkedin.com/in/jane'), 'linkedin')
  assert.equal(classifyUrl('linkedin.com/in/jane'), 'linkedin')
})

test('classifyUrl: github', () => {
  assert.equal(classifyUrl('https://github.com/jane'), 'github')
  assert.equal(classifyUrl('https://jane.github.io'), 'github')
})

test('classifyUrl: personal', () => {
  assert.equal(classifyUrl('https://janedoe.com'), 'personal')
  assert.equal(classifyUrl('https://scholar.google.com/citations?user=abc'), 'personal')
})

test('normalizeDate: ISO short', () => {
  assert.equal(normalizeDate('2024-03'), '2024-03')
  assert.equal(normalizeDate('2024-3'), '2024-03')
  assert.equal(normalizeDate('2024-03-15'), '2024-03')
})

test('normalizeDate: month-name forms', () => {
  assert.equal(normalizeDate('Jan 2024'), '2024-01')
  assert.equal(normalizeDate('January 2024'), '2024-01')
  assert.equal(normalizeDate('Sept 2024'), '2024-09')
  assert.equal(normalizeDate('Sep. 2024'), '2024-09')
  assert.equal(normalizeDate('December 2023'), '2023-12')
})

test('normalizeDate: slash forms', () => {
  assert.equal(normalizeDate('03/2024'), '2024-03')
  assert.equal(normalizeDate('3/2024'), '2024-03')
  assert.equal(normalizeDate('03/15/2024'), '2024-03')
})

test('normalizeDate: year only', () => {
  assert.equal(normalizeDate('2023'), '2023-01')
})

test('normalizeDate: seasons → canonical month', () => {
  assert.equal(normalizeDate('Summer 2024'), '2024-06')
  assert.equal(normalizeDate('Spring 2025'), '2025-04')
  assert.equal(normalizeDate('Fall 2023'), '2023-09')
  assert.equal(normalizeDate('Winter 2022'), '2022-12')
})

test('normalizeDate: quarters', () => {
  assert.equal(normalizeDate('Q3 2023'), '2023-09')
  assert.equal(normalizeDate('Q1 2024'), '2024-03')
  assert.equal(normalizeDate('2024 Q4'), '2024-12')
})

test('normalizeDate: present-like → null', () => {
  assert.equal(normalizeDate('Present'), null)
  assert.equal(normalizeDate('Current'), null)
  assert.equal(normalizeDate('Now'), null)
  assert.equal(normalizeDate('—'), null)
  assert.equal(normalizeDate(''), null)
  assert.equal(normalizeDate(undefined), null)
})

test('isPresentDate', () => {
  assert.equal(isPresentDate('Present'), true)
  assert.equal(isPresentDate('current'), true)
  assert.equal(isPresentDate('—'), true)
  assert.equal(isPresentDate('2024'), false)
})

test('splitBullets: hard breaks', () => {
  const text = '• Built X\n• Did Y\n• Shipped Z'
  const bullets = splitBullets(text)
  assert.equal(bullets.length, 3)
  assert.equal(bullets[0], 'Built X')
  assert.equal(bullets[2], 'Shipped Z')
})

test('splitBullets: numbered prefixes', () => {
  const text = '1. First\n2. Second\n3. Third'
  const bullets = splitBullets(text)
  assert.equal(bullets.length, 3)
  assert.equal(bullets[0], 'First')
})

test('splitBullets: dash bullets', () => {
  const text = '- Alpha\n- Bravo\n- Charlie'
  const bullets = splitBullets(text)
  assert.equal(bullets.length, 3)
})

test('splitBullets: long single chunk → sentence-split', () => {
  const long =
    'I worked on a really really really really really really really really really really really really really really really really really really really really really really long project. ' +
    'It involved many things. ' +
    'I also did other things during that time period.'
  const bullets = splitBullets(long)
  assert.ok(bullets.length >= 2, 'long chunks split on sentence boundary')
})

test('splitBullets: short single chunk → no sentence split', () => {
  const short = 'Built X. Shipped Y.'
  const bullets = splitBullets(short)
  assert.equal(bullets.length, 1)
})

test('splitBullets: empty', () => {
  assert.deepEqual(splitBullets(''), [])
  assert.deepEqual(splitBullets(undefined), [])
})

test('normalizeDegree', () => {
  assert.equal(normalizeDegree('B.S. in Computer Science'), 'BS')
  assert.equal(normalizeDegree('Bachelor of Science'), 'BS')
  assert.equal(normalizeDegree('Master of Business Administration'), 'MBA')
  assert.equal(normalizeDegree('PhD'), 'PhD')
  assert.equal(normalizeDegree('Ph.D.'), 'PhD')
  assert.equal(normalizeDegree('JD'), 'JD')
  assert.equal(normalizeDegree('M.S.'), 'MS')
  assert.equal(normalizeDegree('B.A.'), 'BA')
  assert.equal(normalizeDegree(undefined), undefined)
})

test('inferLevel', () => {
  assert.equal(inferLevel('Software Engineer Intern'), 'intern')
  assert.equal(inferLevel('Senior Software Engineer'), 'senior')
  assert.equal(inferLevel('Staff Engineer'), 'lead')
  assert.equal(inferLevel('Engineering Manager'), 'lead')
  assert.equal(inferLevel('VP of Engineering'), 'exec')
  assert.equal(inferLevel('Junior Developer'), 'junior')
  assert.equal(inferLevel('Software Engineer'), 'mid')
})

test('canonicalizeSchool: head schools', () => {
  assert.equal(canonicalizeSchool('Yale University'), 'yale')
  assert.equal(canonicalizeSchool('Harvard'), 'harvard')
  assert.equal(canonicalizeSchool('MIT'), 'mit')
  assert.equal(canonicalizeSchool('UC Berkeley'), 'berkeley')
})

test('canonicalizeSchool: unknown school slugifies', () => {
  assert.equal(canonicalizeSchool('Some Tiny College'), 'some-tiny-college')
})
