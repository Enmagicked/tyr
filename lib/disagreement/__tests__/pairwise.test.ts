// Unit tests for the generic pairwiseDisagreement<T> helper.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pairwiseDisagreement } from '../pairwise.ts'

test('pairwise: empty items → no pairs, zero aggregate per metric', () => {
  const r = pairwiseDisagreement<number>([], { scalarMetrics: { d: (a, b) => Math.abs(a - b) } })
  assert.deepEqual(r.pairs, [])
  assert.deepEqual(r.aggregate, { d: 0 })
})

test('pairwise: 1 item → no pairs', () => {
  const r = pairwiseDisagreement<number>(
    [{ source: 'x', value: 1 }],
    { scalarMetrics: { d: (a, b) => Math.abs(a - b) } }
  )
  assert.deepEqual(r.pairs, [])
  assert.deepEqual(r.aggregate, { d: 0 })
})

test('pairwise: 2 items → 1 pair, aggregate = pair value', () => {
  const r = pairwiseDisagreement<number>(
    [
      { source: 'a', value: 1 },
      { source: 'b', value: 4 },
    ],
    { scalarMetrics: { d: (a, b) => Math.abs(a - b) } }
  )
  assert.equal(r.pairs.length, 1)
  assert.equal(r.pairs[0].metrics.d, 3)
  assert.equal(r.aggregate.d, 3)
})

test('pairwise: 3 items → 3 pairs, aggregate = mean over pairs', () => {
  const r = pairwiseDisagreement<number>(
    [
      { source: 'a', value: 0 },
      { source: 'b', value: 2 },
      { source: 'c', value: 4 },
    ],
    { scalarMetrics: { d: (a, b) => Math.abs(a - b) } }
  )
  // pairs: |0-2|=2, |0-4|=4, |2-4|=2 → mean = 8/3
  assert.equal(r.pairs.length, 3)
  assert.equal(r.aggregate.d, 8 / 3)
})

test('pairwise: 4 items → 6 pairs', () => {
  const items = [0, 1, 2, 3].map((v) => ({ source: String(v), value: v }))
  const r = pairwiseDisagreement<number>(items, {
    scalarMetrics: { d: (a, b) => Math.abs(a - b) },
  })
  assert.equal(r.pairs.length, 6)
})

test('pairwise: combines all 3 buckets into one metric map', () => {
  const r = pairwiseDisagreement<number>(
    [
      { source: 'a', value: 1 },
      { source: 'b', value: 5 },
    ],
    {
      scalarMetrics: { abs: (a, b) => Math.abs(a - b) },
      setMetrics: { eq: (a, b) => (a === b ? 0 : 1) },
      vectorMetrics: { sq: (a, b) => (a - b) ** 2 },
    }
  )
  assert.equal(r.pairs[0].metrics.abs, 4)
  assert.equal(r.pairs[0].metrics.eq, 1)
  assert.equal(r.pairs[0].metrics.sq, 16)
  assert.equal(r.aggregate.abs, 4)
  assert.equal(r.aggregate.eq, 1)
  assert.equal(r.aggregate.sq, 16)
})

test('pairwise: pair sources record both items in iteration order', () => {
  const r = pairwiseDisagreement<number>(
    [
      { source: 'first', value: 0 },
      { source: 'second', value: 0 },
      { source: 'third', value: 0 },
    ],
    { scalarMetrics: { d: () => 0 } }
  )
  assert.deepEqual(
    r.pairs.map((p) => [p.a, p.b]),
    [
      ['first', 'second'],
      ['first', 'third'],
      ['second', 'third'],
    ]
  )
})

test('pairwise: works on object items', () => {
  type Obj = { v: number; s: string }
  const r = pairwiseDisagreement<Obj>(
    [
      { source: 'a', value: { v: 1, s: 'x' } },
      { source: 'b', value: { v: 3, s: 'y' } },
    ],
    {
      scalarMetrics: {
        v_diff: (a, b) => Math.abs(a.v - b.v),
        s_eq: (a, b) => (a.s === b.s ? 0 : 1),
      },
    }
  )
  assert.equal(r.pairs[0].metrics.v_diff, 2)
  assert.equal(r.pairs[0].metrics.s_eq, 1)
})
