// Consensus extraction over surviving LLM responses.
//
// Each row in `perception_query_responses` is one (model, query_key, resume)
// answer. For list-shape queries (q3 top_strengths) we want the items
// mentioned by the most models; for text-shape queries (q6 key_credential,
// q7 missing_signal) we want the most-detailed answer (longest reasoning
// is the proxy).
//
// Originally inline in app/report/[resumeId]/page.tsx; extracted in M5 so
// synthesize-summary.ts can reuse the same shaping when building the
// LLM prompt context.

export interface PerceptionQueryRow {
  model_name: string
  query_key: string
  scalar: number | null
  list_value: string[] | null
  text_value: string | null
  reasoning: string
}

// List queries: pick top-3 most-mentioned items, preserving original
// capitalization from the first occurrence. Returns null when 0 rows
// answered the query.
export function consensusList(
  rows: readonly PerceptionQueryRow[],
  queryKey: string
): string[] | null {
  const lists = rows
    .filter((r) => r.query_key === queryKey && Array.isArray(r.list_value))
    .map((r) => r.list_value!)
  if (lists.length === 0) return null

  const counts = new Map<string, number>()
  const firstOccurrence = new Map<string, string>()
  for (const list of lists) {
    for (const item of list) {
      const k = item.trim().toLowerCase()
      if (!k) continue
      counts.set(k, (counts.get(k) ?? 0) + 1)
      if (!firstOccurrence.has(k)) firstOccurrence.set(k, item.trim())
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => firstOccurrence.get(k) ?? k)
}

// Text queries: longest text answer wins. Coarse but deterministic.
// Returns null when 0 rows answered.
export function consensusText(
  rows: readonly PerceptionQueryRow[],
  queryKey: string
): string | null {
  const texts = rows
    .filter((r) => r.query_key === queryKey && r.text_value)
    .map((r) => r.text_value!)
  if (texts.length === 0) return null
  return texts.reduce((a, b) => (a.length >= b.length ? a : b))
}
