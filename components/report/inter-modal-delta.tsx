'use client'

import { useEffect, useRef, useState } from 'react'
import { clamp } from '@/lib/scroll/easings'
import { useReducedMotion } from '@/lib/scroll/use-reduced-motion'

interface InterModalDeltaProps {
  // 0 = LLM and ATS agree, 1 = max disagreement. null = unavailable.
  value: number | null
}

function gapLabel(v: number): string {
  if (v < 0.1) return 'aligned'
  if (v < 0.3) return 'mild gap'
  if (v < 0.6) return 'notable gap'
  return 'large gap'
}

export function InterModalDelta({ value }: InterModalDeltaProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [position, setPosition] = useState(0)

  useEffect(() => {
    if (value === null) return
    const target = clamp(value, 0, 1) * 100

    if (reduced) {
      setPosition(target)
      return
    }

    const el = ref.current
    if (!el) {
      setPosition(target)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setPosition(target)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value, reduced])

  return (
    <div
      ref={ref}
      className="bg-paper border border-bone border-t-[2.5px] border-t-marigold rounded-[14px] p-6"
    >
      <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-marigold mb-1">
        Cross-system agreement
      </div>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div className="font-serif text-2xl text-ink">Inter-modal δ</div>
        <span className="text-sm font-mono text-ink">
          {value === null ? '—' : value.toFixed(2)}
        </span>
      </div>
      {value === null ? (
        <p className="text-sm text-driftwood">
          Insufficient data — needs both ATS and LLM seniority signals.
        </p>
      ) : (
        <>
          <div className="relative h-2.5 rounded-full overflow-hidden bg-gradient-to-r from-sage/40 via-marigold/50 to-clay/60">
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-ink shadow-[0_2px_8px_rgba(15,24,48,.25)]"
              style={{
                left: `${position}%`,
                transition: 'left 700ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              aria-hidden="true"
            />
          </div>
          <div className="flex justify-between text-[11px] text-driftwood mt-2">
            <span>aligned</span>
            <span className="text-ink font-medium">{gapLabel(value)}</span>
            <span>large gap</span>
          </div>
          <p className="text-xs text-driftwood/80 mt-3 leading-relaxed">
            How far the LLM read of your seniority drifts from what the ATS
            parsers extracted as your level. Soft signal — calibration improves
            in M5.
          </p>
        </>
      )}
    </div>
  )
}
