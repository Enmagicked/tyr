'use client'

import { useState } from 'react'

interface ParserPairDiff {
  parser_a: string
  parser_b: string
  field_disagreement: Record<string, number>
  experience_alignment: number
  bullet_count_diff: number
}

interface ParserDisagreementCardProps {
  fieldDisagreement: Record<string, number> | null
  experienceAlignment: number | null
  parserPairDiffs: ParserPairDiff[]
}

function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${Math.round(n * 100)}%`
}

export function ParserDisagreementCard({
  fieldDisagreement,
  experienceAlignment,
  parserPairDiffs,
}: ParserDisagreementCardProps) {
  const [expanded, setExpanded] = useState(false)

  if (!fieldDisagreement) {
    return (
      <div className="bg-paper border border-bone border-t-[2.5px] border-t-sage rounded-[14px] p-6 flex flex-col gap-3">
        <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-sage">
          Structural parse
        </div>
        <div className="font-serif text-2xl text-ink">ATS Report</div>
        <p className="text-sm text-driftwood mt-2">
          Insufficient data — only one parser succeeded.
        </p>
      </div>
    )
  }

  const fieldEntries = Object.entries(fieldDisagreement)

  return (
    <div className="bg-paper border border-bone border-t-[2.5px] border-t-sage rounded-[14px] overflow-hidden">
      <div className="px-6 py-5 border-b border-bone">
        <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-sage mb-1">
          Structural parse
        </div>
        <div className="font-serif text-2xl text-ink">ATS Report</div>
      </div>
      <div className="px-6 py-4">
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
          Per-field agreement
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {fieldEntries.map(([field, dval]) => (
            <li key={field} className="flex justify-between text-driftwood">
              <span className="capitalize">{field.replace(/_/g, ' ')}</span>
              <span className="font-mono text-ink">{pct(1 - dval)}</span>
            </li>
          ))}
        </ul>
        {experienceAlignment !== null && (
          <p className="text-xs text-driftwood/70 mt-4">
            Experience alignment:{' '}
            <span className="font-mono text-ink">{pct(experienceAlignment)}</span>
          </p>
        )}
      </div>
      {parserPairDiffs.length > 0 && (
        <div className="border-t border-bone">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-3 text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood hover:bg-vellum/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-thistle/40"
          >
            <span>Pair-by-pair detail ({parserPairDiffs.length})</span>
            <span
              aria-hidden="true"
              className={`transition-transform duration-300 ${
                expanded ? 'rotate-45' : ''
              }`}
            >
              +
            </span>
          </button>
          <div
            hidden={!expanded}
            className="px-6 pb-5 space-y-4 text-sm text-driftwood"
          >
            {parserPairDiffs.map((pd, i) => (
              <div key={i} className="border-t border-bone pt-3">
                <div className="font-medium text-ink mb-2">
                  {pd.parser_a} ↔ {pd.parser_b}
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  {Object.entries(pd.field_disagreement).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span>{k.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-ink">{pct(1 - v)}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs mt-2 flex gap-4">
                  <span>
                    Experience align:{' '}
                    <span className="font-mono text-ink">
                      {pct(pd.experience_alignment)}
                    </span>
                  </span>
                  <span>
                    Bullet diff:{' '}
                    <span className="font-mono text-ink">{pd.bullet_count_diff}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
