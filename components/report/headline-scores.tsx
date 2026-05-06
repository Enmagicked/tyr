'use client'

import { CountUp } from './count-up'

interface HeadlineScore {
  label: string
  // The displayed value; null = "insufficient data — render dashes".
  value: number | null
  // How to render: 'percent' multiplies by 100 and appends %, 'integer' shows
  // the raw integer, 'two-decimal' shows e.g. 0.42.
  format: 'percent' | 'integer' | 'two-decimal'
  caption?: string
  accent: 'sage' | 'clay' | 'marigold' | 'thistle'
  // M5+ extension hook — designed to accept N cards. Currently the report
  // ships 3, but adding outcome status (M5) becomes one more entry here.
}

interface HeadlineScoresProps {
  scores: HeadlineScore[]
}

const ACCENT_BG = {
  sage: 'bg-sage/10',
  clay: 'bg-clay/10',
  marigold: 'bg-marigold/15',
  thistle: 'bg-thistle/15',
} as const

const ACCENT_TEXT = {
  sage: 'text-sage',
  clay: 'text-clay',
  marigold: 'text-marigold',
  thistle: 'text-thistle',
} as const

const ACCENT_BORDER = {
  sage: 'border-t-sage',
  clay: 'border-t-clay',
  marigold: 'border-t-marigold',
  thistle: 'border-t-thistle',
} as const

export function HeadlineScores({ scores }: HeadlineScoresProps) {
  return (
    <div className={`grid gap-4 grid-cols-1 sm:grid-cols-${Math.min(scores.length, 3)}`}>
      {scores.map((s) => {
        const v = s.value
        const display =
          v === null
            ? null
            : s.format === 'percent'
            ? v * 100
            : v
        return (
          <div
            key={s.label}
            className={`bg-paper border border-bone border-t-[2.5px] ${ACCENT_BORDER[s.accent]} rounded-[14px] p-6 flex flex-col gap-2`}
          >
            <div
              className={`text-[10px] font-semibold tracking-[0.18em] uppercase ${ACCENT_TEXT[s.accent]} mb-1`}
            >
              {s.label}
            </div>
            <div
              className={`font-serif text-5xl text-ink leading-none flex items-baseline gap-1`}
            >
              {v === null ? (
                <span className="text-driftwood/50">—</span>
              ) : (
                <>
                  <CountUp
                    value={display}
                    decimals={
                      s.format === 'percent' || s.format === 'integer' ? 0 : 2
                    }
                    suffix={s.format === 'percent' ? '%' : ''}
                  />
                  {s.format === 'integer' && s.label.includes('legibility') && (
                    <span className="font-sans text-base text-driftwood ml-1">
                      / 100
                    </span>
                  )}
                </>
              )}
            </div>
            <div
              className={`inline-flex items-center self-start text-[11px] px-2.5 py-0.5 rounded-full ${ACCENT_BG[s.accent]} ${ACCENT_TEXT[s.accent]}`}
            >
              {s.caption ?? ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}
