// Tests for the M4 scroll/animation math primitives. count-up, ease, lerp,
// and easeOutCubic all live here; they're hot paths under animation so the
// invariants are worth pinning.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  clamp,
  lerp,
  easeInOut,
  ease,
  easeOutCubic,
} from '../easings.ts'

test('clamp: below lower → lower', () => {
  assert.equal(clamp(-5, 0, 10), 0)
})
test('clamp: above upper → upper', () => {
  assert.equal(clamp(15, 0, 10), 10)
})
test('clamp: within range → unchanged', () => {
  assert.equal(clamp(5, 0, 10), 5)
})

test('lerp: t=0 → a', () => {
  assert.equal(lerp(2, 8, 0), 2)
})
test('lerp: t=1 → b', () => {
  assert.equal(lerp(2, 8, 1), 8)
})
test('lerp: t=0.5 → midpoint', () => {
  assert.equal(lerp(2, 8, 0.5), 5)
})

test('easeInOut: t=0 → 0', () => {
  assert.equal(easeInOut(0), 0)
})
test('easeInOut: t=1 → 1', () => {
  assert.equal(easeInOut(1), 1)
})
test('easeInOut: t=0.5 → 0.5 (symmetric)', () => {
  // 2 * 0.25 = 0.5
  assert.equal(easeInOut(0.5), 0.5)
})

test('ease: clamps below input range to start', () => {
  assert.equal(ease(-1, 0, 1, 100, 200), 100)
})
test('ease: clamps above input range to end', () => {
  assert.equal(ease(2, 0, 1, 100, 200), 200)
})
test('ease: identity midpoint', () => {
  assert.equal(ease(0.5, 0, 1, 0, 100), 50)
})
test('ease: degenerate range (a==b) does not divide by zero', () => {
  // The implementation guards with `(b - a || 1)`. The exact returned value
  // is not the load-bearing invariant — what matters is "no NaN, no infinity".
  const r = ease(5, 5, 5, 0, 100)
  assert.ok(Number.isFinite(r))
})

test('easeOutCubic: t=0 → 0', () => {
  assert.equal(easeOutCubic(0), 0)
})
test('easeOutCubic: t=1 → 1', () => {
  assert.equal(easeOutCubic(1), 1)
})
test('easeOutCubic: monotone increasing', () => {
  assert.ok(easeOutCubic(0.2) < easeOutCubic(0.5))
  assert.ok(easeOutCubic(0.5) < easeOutCubic(0.8))
})
test('easeOutCubic: clamps inputs above 1', () => {
  assert.equal(easeOutCubic(1.5), 1)
})
test('easeOutCubic: clamps inputs below 0', () => {
  assert.equal(easeOutCubic(-0.2), 0)
})

test('count-up math: linear time at midpoint exceeds halfway (decelerates)', () => {
  // Critical property of ease-out: at t=0.5 the displayed value is past 50%.
  // For cubic ease-out: 1 - (1-0.5)^3 = 1 - 0.125 = 0.875.
  assert.equal(easeOutCubic(0.5), 0.875)
})
