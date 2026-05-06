'use client'

import { useRef } from 'react'
import { useElementProgress } from '@/lib/scroll/use-scroll'
import { useReducedMotion } from '@/lib/scroll/use-reduced-motion'
import { clamp, ease } from '@/lib/scroll/easings'
import { ExplodedView } from './exploded-view'

const PANELS = [
  {
    num: '01',
    heading: 'Every resume goes through\na machine first.',
    body: 'Before a human opens your file, automated systems parse, score, and filter. Most candidates never learn what was extracted — or what was missed.',
  },
  {
    num: '02',
    heading: 'Then four AI models describe\nyou to a recruiter.',
    body: 'GPT-4o, Claude, Gemini, and Llama each summarize your experience, read your seniority, and flag gaps — all before a hiring manager sees your name. tyr measures where they agree and where they do not.',
  },
  {
    num: '03',
    heading: 'tyr decodes both into\none judgment.',
    body: 'One upload. Two complete reports. Your parser-disagreement score, your AI-legibility score, the per-query σ and ρ across models, and the exact edits that move both numbers.',
  },
]

export function ScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const liveProgress = useElementProgress(ref)
  // When reduced motion is on, freeze progress at 1.0 so all content is
  // immediately visible without driving any scroll-tied transforms.
  const progress = reduced ? 1 : liveProgress

  const panelIdx = clamp(Math.floor(progress * 3), 0, 2)
  const panelProg = progress * 3 - panelIdx

  return (
    <div
      ref={ref}
      className="bg-vellum relative"
      style={{ height: '380vh' }}
      id="reports"
    >
      <div className="sticky top-0 h-[100dvh] overflow-hidden bg-vellum">
        {/* dot grid */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-50"
          style={{
            backgroundImage: 'radial-gradient(#E5DFCF 1.2px, transparent 1.2px)',
            backgroundSize: '36px 36px',
          }}
        />

        {/* Mobile fallback (<900px): stacked, non-sticky-feel layout */}
        <div className="lg:hidden absolute inset-0 overflow-y-auto px-6 py-12 flex flex-col gap-12">
          <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood">
            How tyr works
          </div>
          {PANELS.map((p, i) => (
            <div key={i} className="flex flex-col gap-4">
              <div className="font-serif text-[80px] text-bone leading-[0.85] tracking-[-0.05em]">
                {p.num}
              </div>
              <h3
                className="font-serif text-[28px] text-ink leading-[1.12] tracking-[-0.022em] whitespace-pre-line"
              >
                {p.heading}
              </h3>
              <p className="text-[15px] leading-[1.82] text-driftwood">
                {p.body}
              </p>
            </div>
          ))}
        </div>

        {/* Desktop (≥900px): sticky two-pane scroll-driven layout */}
        <div className="hidden lg:block">
          {/* Right — exploded view */}
          <div className="absolute right-0 top-0 w-[52%] h-full flex items-center justify-center pl-6 pr-12 z-[2]">
            <ExplodedView progress={progress} />
          </div>

          {/* Left — text panels */}
          <div className="absolute left-0 top-0 w-[48%] h-full flex items-center pl-16 z-[5]">
            <div className="max-w-[440px] relative min-h-[340px]">
              <div className="absolute -top-24 left-0 text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood">
                How tyr works
              </div>
              {PANELS.map((p, i) => {
                const active = i === panelIdx
                let op = 0
                let ty = 0
                if (active) {
                  op = ease(panelProg, 0, 0.28, 0, 1)
                  ty = ease(panelProg, 0, 0.28, 22, 0)
                } else if (i < panelIdx) {
                  op = 0
                  ty = -28
                } else {
                  op = 0
                  ty = 28
                }
                return (
                  <div
                    key={i}
                    className={
                      i === 0
                        ? 'relative top-0 left-0 right-0 transition-[opacity,transform] duration-500 ease-out'
                        : 'absolute top-0 left-0 right-0 transition-[opacity,transform] duration-500 ease-out'
                    }
                    style={{
                      opacity: op,
                      transform: `translateY(${ty}px)`,
                      pointerEvents: active ? 'auto' : 'none',
                    }}
                  >
                    <div className="font-serif text-[112px] text-bone leading-[0.85] tracking-[-0.05em] mb-5 select-none">
                      {p.num}
                    </div>
                    <h2
                      className="font-serif text-ink mb-5 whitespace-pre-line"
                      style={{
                        fontSize: 'clamp(26px, 2.8vw, 38px)',
                        fontWeight: 400,
                        lineHeight: 1.12,
                        letterSpacing: '-0.022em',
                      }}
                    >
                      {p.heading}
                    </h2>
                    <p className="text-[15px] leading-[1.82] text-driftwood max-w-[380px]">
                      {p.body}
                    </p>
                  </div>
                )
              })}
              <div className="absolute -bottom-16 flex gap-2">
                {PANELS.map((_, i) => (
                  <div
                    key={i}
                    className="h-[3px] rounded-[1.5px] transition-all duration-500"
                    style={{
                      width: i === panelIdx ? 32 : 8,
                      background: i === panelIdx ? '#1E1812' : '#E5DFCF',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
