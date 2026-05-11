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

// Text queries: pick the LLM whose answer carries the most useful content,
// considering BOTH text_value and reasoning. Pre-2026-05-10 this only
// looked at text_value, so a short headline (e.g. "No iOS experience.")
// would beat a model whose text_value was even shorter but whose reasoning
// was a 4-sentence JD-grounded explanation. The reasoning field is where
// the meat usually lives — we want it surfaced.
//
// Strategy:
//   1. Score each candidate as `text.length + reasoning.length`. Pick the row
//      with the highest total. Coarse but deterministic.
//   2. When the winning row has substantive content in BOTH fields (reasoning
//      > 50% of text length), concatenate "<text> <reasoning>" so the
//      headline + the supporting detail both reach the reader.
//   3. Otherwise return whichever of text / reasoning is non-empty.
export function consensusText(
  rows: readonly PerceptionQueryRow[],
  queryKey: string
): string | null {
  const candidates = rows
    .filter((r) => r.query_key === queryKey)
    .map((r) => ({
      text: (r.text_value ?? '').trim(),
      reasoning: (r.reasoning ?? '').trim(),
    }))
    .filter((c) => c.text.length > 0 || c.reasoning.length > 0)
  if (candidates.length === 0) return null

  const best = candidates.reduce((a, b) =>
    a.text.length + a.reasoning.length >= b.text.length + b.reasoning.length ? a : b
  )

  if (best.text && best.reasoning && best.reasoning.length > best.text.length * 0.5) {
    return `${best.text} ${best.reasoning}`
  }
  return best.text || best.reasoning
}
