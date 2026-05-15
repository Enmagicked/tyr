// Compact row for the /reports listing. Whole row is a link to the
// individual report. Mini-stats: parser agreement %, AI-legibility / 100.

import Link from 'next/link'

export interface ReportRowData {
  id: string
  file_name: string
  target_role: string | null
  target_company: string | null
  created_at: string
  parser_agreement: number | null    // 1 - parse_disagreement.overall_score, or null
  ai_legibility: number | null        // 0..100
  // M9.5: 'builder' rows route to /builder/[id] (the editable preview)
  // instead of /report/[id] (the analyzer dashboard).
  input_kind?: 'pdf' | 'url' | 'image' | 'builder' | null
}

function relativeAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const month = Math.floor(day / 30)
  return `${month}mo ago`
}

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—'
  return `${Math.round(n * 100)}%`
}

export function ReportRow({ row }: { row: ReportRowData }) {
  const isBuilder = row.input_kind === 'builder'
  const href = isBuilder ? `/builder/${row.id}` : `/report/${row.id}`
  return (
    <Link
      href={href}
      className="block bg-paper border border-bone rounded-[12px] p-5 hover:border-ink/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="font-serif text-[20px] text-ink truncate">
              {row.file_name}
            </div>
            {isBuilder && (
              <span className="inline-flex items-center text-[10px] font-semibold tracking-[0.12em] uppercase px-2 py-0.5 rounded-full bg-marigold/20 text-ink border border-marigold/40 flex-shrink-0">
                Builder
              </span>
            )}
          </div>
          <div className="text-xs text-driftwood truncate">
            {row.target_role && row.target_company
              ? `${row.target_role} at ${row.target_company}`
              : row.target_role
                ? row.target_role
                : 'no target set'}
            <span className="mx-2 text-driftwood/40">·</span>
            {relativeAge(row.created_at)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-sage/15 text-sage border border-sage/20">
            Parser {pct(row.parser_agreement)}
          </span>
          <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-clay/15 text-clay border border-clay/20">
            AI-legibility {row.ai_legibility ?? '—'}/100
          </span>
        </div>
      </div>
    </Link>
  )
}
