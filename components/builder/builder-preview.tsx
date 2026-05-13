'use client'

import { useState } from 'react'
import posthog from 'posthog-js'
import type { GeneratedResume } from '@/lib/builder/types'
import './print-styles.css'

const REWRITE_CAP = 5

interface BuilderPreviewProps {
  resumeId: string
  initialGenerated: GeneratedResume
  rewritesUsed: number
}

export function BuilderPreview({
  resumeId,
  initialGenerated,
  rewritesUsed: initialRewrites,
}: BuilderPreviewProps) {
  const [generated, setGenerated] = useState(initialGenerated)
  const [rewritesUsed, setRewritesUsed] = useState(initialRewrites)
  const [rewritingPath, setRewritingPath] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const rewritesLeft = REWRITE_CAP - rewritesUsed
  const canRewrite = rewritesLeft > 0

  async function rewrite(sectionIndex: number, itemIndex: number, bulletIndex: number) {
    if (!canRewrite) return
    const path = `${sectionIndex}-${itemIndex}-${bulletIndex}`
    setRewritingPath(path)
    setErrorMsg('')
    try {
      const r = await fetch('/api/builder/rewrite-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeId,
          sectionIndex,
          itemIndex,
          bulletIndex,
          generated,
        }),
      })
      if (!r.ok) {
        const { error } = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
        throw new Error(error ?? 'Rewrite failed')
      }
      const { bullet, rewrites_used } = (await r.json()) as {
        bullet: string
        rewrites_used: number
        rewrites_remaining: number
      }
      setGenerated((g) => ({
        ...g,
        sections: g.sections.map((s, i) => {
          if (i !== sectionIndex) return s
          return {
            ...s,
            items: s.items.map((it, j) => {
              if (j !== itemIndex) return it
              return {
                ...it,
                bullets: it.bullets.map((b, k) => (k === bulletIndex ? bullet : b)),
              }
            }),
          }
        }),
      }))
      setRewritesUsed(rewrites_used)
      posthog.capture('builder_bullet_rewritten', {
        resume_id: resumeId,
        section_index: sectionIndex,
        rewrites_used,
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Rewrite failed')
    } finally {
      setRewritingPath(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-[12px] text-driftwood/80">
          {canRewrite ? (
            <>
              <span className="font-medium text-ink">{rewritesLeft}</span> bullet rewrite
              {rewritesLeft === 1 ? '' : 's'} remaining · click 🔁 on any bullet
            </>
          ) : (
            <>Out of bullet rewrites for this draft.</>
          )}
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-vellum hover:bg-ink/90"
        >
          Print / save as PDF
        </button>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-clay/30 bg-clay/5 px-4 py-2 text-sm text-clay print:hidden">
          {errorMsg}
        </div>
      )}

      <article
        id="builder-resume"
        className="rounded-2xl border border-bone bg-paper p-8 md:p-12 print:border-0 print:p-0 print:rounded-none"
      >
        <header className="text-center mb-6">
          <h2 className="font-serif text-3xl text-ink mb-1">{generated.name}</h2>
          <p className="text-sm text-driftwood/90">{generated.contact_line}</p>
        </header>

        {generated.sections.map((section, sectionIndex) => (
          <section key={sectionIndex} className="mb-6 last:mb-0">
            <h3 className="text-[11px] font-semibold tracking-[0.18em] uppercase text-ink border-b border-ink/30 pb-1 mb-3">
              {section.heading}
            </h3>
            {section.items.map((item, itemIndex) => (
              <div key={itemIndex} className="mb-4 last:mb-0">
                <p className="font-medium text-ink text-[14px]">{item.header}</p>
                {item.bullets.length > 0 && (
                  <ul className="mt-1.5 space-y-1.5">
                    {item.bullets.map((bullet, bulletIndex) => {
                      const path = `${sectionIndex}-${itemIndex}-${bulletIndex}`
                      const isRewriting = rewritingPath === path
                      return (
                        <li
                          key={bulletIndex}
                          className="flex items-start gap-2 text-[13px] text-ink/90 leading-relaxed group"
                        >
                          <span className="text-driftwood/60 mt-0.5">•</span>
                          <span className="flex-1">{bullet}</span>
                          {canRewrite && (
                            <button
                              type="button"
                              onClick={() => rewrite(sectionIndex, itemIndex, bulletIndex)}
                              disabled={isRewriting || rewritingPath !== null}
                              title="Rewrite this bullet"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] px-2 py-0.5 rounded-full border border-bone text-driftwood hover:bg-bone disabled:opacity-50 print:hidden whitespace-nowrap"
                            >
                              {isRewriting ? '…' : '🔁 Rewrite'}
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))}
      </article>
    </div>
  )
}
