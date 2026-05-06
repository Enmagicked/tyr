'use client'

import { ease } from '@/lib/scroll/easings'

const ATS_ROWS = [
  { label: 'Contact parsed', val: 'Name · Email · LinkedIn', good: true as const },
  { label: 'Format risk', val: 'Tables detected — may fail', good: false as const },
  { label: 'Keyword match', val: '71 of 100 required keywords', good: null },
  { label: 'ATS score', val: '68 / 100', score: 68, good: null },
  { label: 'File format', val: 'PDF — compatible', good: true as const },
] as const

const AI_ROWS = [
  {
    label: 'Recruiter summary',
    val: '"Mid-level engineer, backend focus"',
    good: true as const,
  },
  {
    label: 'Seniority read',
    val: 'Mid actual vs. Senior target',
    good: false as const,
  },
  { label: 'Skill signal', val: 'Python ↑ · Leadership ↓', good: null },
  { label: 'Perception score', val: '74 / 100', score: 74, good: null },
  { label: 'Top fix', val: 'Add outcome metrics to 3 bullets', good: true as const },
] as const

const BADGES = [
  'Python', 'React', '4 yrs exp.', 'Mid-level', 'AWS',
  'SQL', 'No metrics', 'Gaps Q1 ’23', 'PM adjacent', 'Backend strong',
] as const

type Row = {
  label: string
  val: string
  score?: number
  good: boolean | null
}

interface ReportCardProps {
  rows: readonly Row[]
  visible: number
  accent: 'sage' | 'clay'
  label: string
  title: string
}

function ReportCard({ rows, visible, accent, label, title }: ReportCardProps) {
  const accentColor = accent === 'sage' ? '#7E967A' : '#C58569'
  return (
    <div
      className="bg-paper rounded-[10px] overflow-hidden flex-1 min-w-0 border-t-[2.5px]"
      style={{
        borderColor: `${accentColor}28`,
        borderTopColor: accentColor,
        borderWidth: '1px',
        borderTopWidth: '2.5px',
      }}
    >
      <div
        className="px-3.5 py-2 border-b border-bone text-[10px] font-semibold tracking-[0.1em] uppercase"
        style={{ background: `${accentColor}0e`, color: accentColor }}
      >
        {label}
      </div>
      <div className="px-3.5 py-1.5 border-b border-bone font-serif text-[16px] text-ink">
        {title}
      </div>
      {rows.slice(0, Math.max(0, visible)).map((r, i) => (
        <div key={i} className="px-3.5 py-2 border-b border-bone last:border-b-0">
          <div className="text-[10px] text-driftwood mb-1">{r.label}</div>
          <div
            className="text-[11px] font-medium"
            style={{
              color:
                r.good === true ? '#7E967A' : r.good === false ? '#C58569' : '#1E1812',
            }}
          >
            {r.val}
          </div>
          {r.score !== undefined && (
            <div className="h-[2px] bg-bone rounded-[1px] mt-1.5">
              <div
                className="h-full rounded-[1px]"
                style={{
                  width: `${r.score}%`,
                  background: accentColor,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function ExplodedView({ progress }: { progress: number }) {
  const docOp = ease(progress, 0, 0.22, 0, 1)
  const docY = ease(progress, 0, 0.22, 28, 0)
  const badgeOp = ease(progress, 0.18, 0.48, 0, 1)
  const badgeY = ease(progress, 0.18, 0.48, 32, 0)
  const cardOp = ease(progress, 0.46, 0.72, 0, 1)
  const cardY = ease(progress, 0.46, 0.72, 40, 0)
  const atsRows = Math.floor(ease(progress, 0.52, 0.95, 0, 5.99))
  const aiRows = Math.floor(ease(progress, 0.62, 0.98, 0, 5.99))

  return (
    <div className="w-full max-w-[460px]">
      {/* Layer 1 — resume */}
      <div
        style={{ opacity: docOp, transform: `translateY(${docY}px)` }}
        className="mb-3.5"
      >
        <div className="text-[9px] font-semibold tracking-[0.12em] uppercase text-driftwood mb-2">
          Your resume
        </div>
        <div
          className="bg-paper rounded-[9px] px-5 py-4 relative overflow-hidden border border-bone"
          style={{ boxShadow: '0 4px 20px rgba(15,24,48,.08)' }}
        >
          {progress < 0.42 && (
            <div
              className="absolute left-0 right-0 h-[1.5px] pointer-events-none"
              style={{
                top: `${ease(progress, 0, 0.42, 0, 92)}%`,
                background: 'linear-gradient(90deg, transparent, rgba(126,150,122,.56), transparent)',
                boxShadow: '0 0 8px rgba(126,150,122,.4)',
              }}
            />
          )}
          {[0.62, 0.42, 1, 0.8, 0.65, 0.9, 0.72, 1, 0.5, 0.84, 0.68, 0.6, 1, 0.75, 0.58].map(
            (w, i) => (
              <div
                key={i}
                style={{
                  height: w === 1 ? 1 : 5,
                  borderRadius: 2,
                  background: w === 1 ? '#E5DFCF' : `rgba(30,24,18,${0.1 + i * 0.018})`,
                  width: `${w * 100}%`,
                  marginBottom: w === 1 ? 12 : 5,
                }}
              />
            )
          )}
        </div>
      </div>

      {badgeOp > 0.05 && (
        <div
          className="w-px h-4 bg-bone ml-[22px]"
          style={{ opacity: badgeOp }}
        />
      )}

      {/* Layer 2 — signals */}
      <div
        style={{ opacity: badgeOp, transform: `translateY(${badgeY}px)` }}
        className="mb-3.5 mt-3.5"
      >
        <div className="text-[9px] font-semibold tracking-[0.12em] uppercase text-driftwood mb-2">
          Extracted signals
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BADGES.map((b, i) => {
            const tint = i % 3
            const bg = tint === 0 ? 'rgba(126,150,122,.07)' : tint === 1 ? 'rgba(197,133,105,.07)' : '#E5DFCF'
            const border = tint === 0 ? 'rgba(126,150,122,.18)' : tint === 1 ? 'rgba(197,133,105,.18)' : '#E5DFCF'
            const color = tint === 0 ? '#7E967A' : tint === 1 ? '#C58569' : '#6E6358'
            return (
              <span
                key={i}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-opacity duration-300"
                style={{
                  background: bg,
                  borderColor: border,
                  color,
                  opacity: badgeOp > i * 0.09 ? 1 : 0,
                }}
              >
                {b}
              </span>
            )
          })}
        </div>
      </div>

      {cardOp > 0.05 && (
        <div
          className="w-px h-4 bg-bone ml-[22px]"
          style={{ opacity: cardOp }}
        />
      )}

      {/* Layer 3 — reports */}
      <div
        style={{ opacity: cardOp, transform: `translateY(${cardY}px)` }}
        className="mt-3.5"
      >
        <div className="text-[9px] font-semibold tracking-[0.12em] uppercase text-driftwood mb-2">
          Judgment reports
        </div>
        <div className="flex gap-2.5">
          <ReportCard
            rows={ATS_ROWS}
            visible={atsRows}
            accent="sage"
            label="ATS Report"
            title="Structural parse"
          />
          <ReportCard
            rows={AI_ROWS}
            visible={aiRows}
            accent="clay"
            label="AI Perception"
            title="AI interpretation"
          />
        </div>
      </div>
    </div>
  )
}
