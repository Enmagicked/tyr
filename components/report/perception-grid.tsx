'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/lib/scroll/use-reduced-motion'

const QUERY_LABELS: Record<string, string> = {
  seniority: 'Seniority (1-10)',
  technical_depth: 'Technical depth (1-10)',
  top_strengths: 'Top strengths',
  fit: 'Role fit (1-10)',
  final_round_probability: 'Final-round probability',
  key_credential: 'Key credential',
  missing_signal: 'Missing signal',
  ai_authored: 'AI-authored probability',
}

const SCALAR_QUERIES = new Set([
  'seniority',
  'technical_depth',
  'fit',
  'final_round_probability',
  'ai_authored',
])

const QUERY_ORDER = [
  'seniority',
  'technical_depth',
  'top_strengths',
  'fit',
  'final_round_probability',
  'key_credential',
  'missing_signal',
  'ai_authored',
]

interface PerceptionGridProps {
  features: Record<string, number | null>
  nLLMs: number
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

// Maps a query key to the right `mean_*` and `sigma_*` field names. The schema
// uses `mean_final_round_prob` (not `mean_final_round_probability`) for that
// one; everything else just prepends `mean_` / `sigma_`.
function meanKey(q: string): string {
  return `mean_${q === 'final_round_probability' ? 'final_round_prob' : q}`
}
function sigmaKey(q: string): string {
  return `sigma_${q === 'final_round_probability' ? 'final_round_prob' : q}`
}
function rhoKey(q: string): string {
  return `rho_${q}`
}

export function PerceptionGrid({ features, nLLMs }: PerceptionGridProps) {
  const ref = useRef<HTMLTableElement>(null)
  const reduced = useReducedMotion()
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (reduced) {
      setRevealed(true)
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRevealed(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.25 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])

  return (
    <div className="bg-paper border border-bone border-t-[2.5px] border-t-clay rounded-[14px] overflow-hidden">
      <div className="px-6 py-5 border-b border-bone">
        <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-clay mb-1">
          AI interpretation
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-serif text-2xl text-ink">AI Perception Report</div>
          <span className="text-xs text-driftwood">
            {nLLMs} of 4 LLMs responded
          </span>
        </div>
      </div>
      <div className="px-6 py-4">
        <table ref={ref} className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.12em] text-driftwood text-left">
              <th className="font-normal pb-2">Query</th>
              <th className="font-normal pb-2 text-right">Mean</th>
              <th className="font-normal pb-2 text-right">σ scalar</th>
              <th className="font-normal pb-2">ρ reasoning</th>
            </tr>
          </thead>
          <tbody>
            {QUERY_ORDER.map((q, i) => {
              const isScalar = SCALAR_QUERIES.has(q)
              const mean = isScalar ? (features[meanKey(q)] ?? null) : null
              const sigma = isScalar ? (features[sigmaKey(q)] ?? null) : null
              const rho = features[rhoKey(q)] ?? null
              const rhoBar = rho === null ? 0 : Math.min(1, rho)
              return (
                <tr
                  key={q}
                  className="border-t border-bone text-driftwood"
                >
                  <td className="py-2 text-ink">{QUERY_LABELS[q]}</td>
                  <td className="py-2 text-right font-mono text-ink">
                    {fmt(mean)}
                  </td>
                  <td className="py-2 text-right font-mono text-ink">
                    {fmt(sigma)}
                  </td>
                  <td className="py-2 pl-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-bone rounded-full overflow-hidden">
                        <div
                          className="h-full bg-clay origin-left"
                          style={{
                            transform: `scaleX(${revealed ? rhoBar : 0})`,
                            transition: `transform 600ms ease ${i * 50}ms`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs text-ink min-w-[2.5em] text-right">
                        {fmt(rho)}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
