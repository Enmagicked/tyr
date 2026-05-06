// Generic pairwise disagreement helper. Used by:
//   - lib/agents/disagreement.ts (M2: cross-parser canonical resume comparison)
//   - lib/agents/perception-disagreement.ts (M3: cross-LLM perception comparison)
//
// The 3-bucket split (scalar/set/vector) is informational — every metric is a
// `(a, b) => number` returning 0 (identical) … 1 (fully different). Buckets
// are kept distinct in the API so call sites self-document which kind of
// distance each metric represents.

export type Metric<T> = (a: T, b: T) => number

export interface PairwiseConfig<T> {
  scalarMetrics?: Record<string, Metric<T>>
  setMetrics?: Record<string, Metric<T>>
  vectorMetrics?: Record<string, Metric<T>>
}

export interface PairwiseItem<T> {
  source: string
  value: T
}

export interface PairwisePairResult {
  a: string
  b: string
  metrics: Record<string, number>
}

export interface PairwiseResult {
  pairs: PairwisePairResult[]
  aggregate: Record<string, number>
}

function combineMetrics<T>(config: PairwiseConfig<T>): Record<string, Metric<T>> {
  return {
    ...(config.scalarMetrics ?? {}),
    ...(config.setMetrics ?? {}),
    ...(config.vectorMetrics ?? {}),
  }
}

export function pairwiseDisagreement<T>(
  items: PairwiseItem<T>[],
  config: PairwiseConfig<T>
): PairwiseResult {
  const metrics = combineMetrics(config)
  const metricKeys = Object.keys(metrics)

  if (items.length < 2) {
    const aggregate: Record<string, number> = {}
    for (const k of metricKeys) aggregate[k] = 0
    return { pairs: [], aggregate }
  }

  const pairs: PairwisePairResult[] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const pairMetrics: Record<string, number> = {}
      for (const k of metricKeys) {
        pairMetrics[k] = metrics[k](items[i].value, items[j].value)
      }
      pairs.push({ a: items[i].source, b: items[j].source, metrics: pairMetrics })
    }
  }

  const aggregate: Record<string, number> = {}
  for (const k of metricKeys) {
    let sum = 0
    for (const p of pairs) sum += p.metrics[k] ?? 0
    aggregate[k] = pairs.length > 0 ? sum / pairs.length : 0
  }

  return { pairs, aggregate }
}
