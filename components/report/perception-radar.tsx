// M8.D chart 2/3: per-LLM radar plot.
//
// 4 axes (seniority, technical_depth, fit, ai_authored — the 4 scalar
// queries with consistent meaning across resumes). One semi-transparent
// polygon per LLM that returned a parseable scalar for any of the axes.
// Where the polygons overlap, the LLMs agreed; where they spread, they
// disagreed.
//
// Pure SVG. The data is `queryRows` from the report page — same row set
// already used for consensus computation.
//
// Note on the "ai_authored" axis: HIGH score = "model thinks resume is
// AI-authored" (bad signal for the candidate). The other 3 axes treat
// HIGH as good. We don't invert axes here — the absolute spread between
// LLMs is what matters visually, not whether high is "good."

import type { PerceptionQueryRow } from '@/lib/agents/consensus'

interface PerceptionRadarProps {
  queryRows: PerceptionQueryRow[]
}

interface AxisSpec {
  key: 'seniority' | 'technical_depth' | 'fit' | 'ai_authored'
  label: string
  // Axis range used to normalize per-LLM scalar values to [0,1]
  range: [number, number]
}

const AXES: AxisSpec[] = [
  { key: 'seniority',       label: 'Seniority',       range: [1, 10] },
  { key: 'technical_depth', label: 'Tech depth',      range: [1, 10] },
  { key: 'fit',             label: 'Fit',             range: [1, 10] },
  { key: 'ai_authored',     label: 'AI-authored',     range: [0, 1] },
]

const MODEL_COLORS: Record<string, string> = {
  'gpt-4o':            '#7E967A', // sage
  'claude-sonnet-4-6': '#846F9C', // thistle
  'gemini-2.5-flash':  '#F0B85C', // marigold
  'llama-3.3-70b':     '#C58569', // clay
}

const MODEL_LABEL: Record<string, string> = {
  'gpt-4o':            'GPT-4o',
  'claude-sonnet-4-6': 'Claude',
  'gemini-2.5-flash':  'Gemini',
  'llama-3.3-70b':     'Llama 3.3',
}

// Layout (px) — square SVG so axes are evenly spaced.
const SIZE = 280
const CX = SIZE / 2
const CY = SIZE / 2
const RADIUS = 95         // outermost ring
const RING_COUNT = 4      // 4 concentric rings at 0.25, 0.5, 0.75, 1.0
const LABEL_R = RADIUS + 18
const C_BONE = '#E5DFCF'
const C_DRIFTWOOD = '#6E6358'
const C_INK = '#1E1812'

// 4 axes evenly spaced; start at the top (12 o'clock) and go clockwise.
function axisPoint(axisIndex: number, fraction: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (axisIndex / AXES.length) * 2 * Math.PI
  return {
    x: CX + Math.cos(angle) * RADIUS * fraction,
    y: CY + Math.sin(angle) * RADIUS * fraction,
  }
}

function normalize(value: number, [lo, hi]: [number, number]): number {
  if (hi === lo) return 0
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)))
}

interface ModelPolygon {
  model: string
  color: string
  // (axisIndex → normalized value or null when this LLM didn't answer this axis)
  values: (number | null)[]
}

// Postgres `numeric` columns come back from Supabase's PostgREST as STRINGS
// to preserve arbitrary precision (perception_query_responses.scalar is
// numeric, see migration 0003). Coerce to number here — without this every
// row was dropped by the previous `typeof !== 'number'` guard and the
// radar rendered the empty state even with full data.
function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function buildPolygons(rows: PerceptionQueryRow[]): ModelPolygon[] {
  const byModel = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const n = toFiniteNumber(r.scalar)
    if (n === null) continue
    if (!byModel.has(r.model_name)) byModel.set(r.model_name, new Map())
    byModel.get(r.model_name)!.set(r.query_key, n)
  }
  const out: ModelPolygon[] = []
  for (const [model, scores] of byModel.entries()) {
    const color = MODEL_COLORS[model] ?? '#6E6358'
    const values = AXES.map((axis) => {
      const raw = scores.get(axis.key)
      return raw === undefined ? null : normalize(raw, axis.range)
    })
    // Drop polygons where the model answered fewer than 2 axes — can't draw a polygon.
    if (values.filter((v) => v !== null).length < 2) continue
    out.push({ model, color, values })
  }
  return out
}

// Build a polygon path that skips axes where the model didn't answer. Uses
// the previous responding axis's value for the missing axis to keep the
// polygon closed visually (and notes the missing data subtly via opacity).
function polygonPath(values: (number | null)[]): string {
  // First non-null index — fall back if everything is null (shouldn't happen
  // because buildPolygons filters those out).
  const firstIdx = values.findIndex((v) => v !== null)
  if (firstIdx === -1) return ''
  let lastValid = values[firstIdx]!
  const points: string[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? lastValid
    if (values[i] !== null) lastValid = values[i]!
    const { x, y } = axisPoint(i, v)
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return `M${points.join(' L')} Z`
}

export function PerceptionRadar({ queryRows }: PerceptionRadarProps) {
  const polygons = buildPolygons(queryRows)

  return (
    <div className="bg-paper border border-bone border-t-[2.5px] border-t-thistle rounded-[14px] overflow-hidden">
      <div className="px-6 py-5 border-b border-bone">
        <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-thistle mb-1">
          Per-LLM radar
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-serif text-2xl text-ink">How each LLM read you</div>
          <span className="text-xs text-driftwood">overlap = agreement</span>
        </div>
      </div>
      <div className="px-6 py-5 flex flex-col items-center gap-4">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="280"
          height="280"
          role="img"
          aria-label="Per-LLM radar plot of seniority, technical depth, fit, and AI-authored probability"
        >
          {/* Concentric rings */}
          {Array.from({ length: RING_COUNT }, (_, i) => {
            const r = RADIUS * ((i + 1) / RING_COUNT)
            return (
              <circle
                key={i}
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke={C_BONE}
                strokeWidth={1}
              />
            )
          })}

          {/* Axis lines from center to edge */}
          {AXES.map((_, i) => {
            const { x, y } = axisPoint(i, 1)
            return (
              <line
                key={i}
                x1={CX}
                y1={CY}
                x2={x}
                y2={y}
                stroke={C_BONE}
                strokeWidth={1}
              />
            )
          })}

          {/* Axis labels — placed just outside the outer ring */}
          {AXES.map((axis, i) => {
            const angle = -Math.PI / 2 + (i / AXES.length) * 2 * Math.PI
            const x = CX + Math.cos(angle) * LABEL_R
            const y = CY + Math.sin(angle) * LABEL_R + 3
            // Anchor depends on axis position to keep labels off the polygon
            let anchor: 'middle' | 'start' | 'end' = 'middle'
            if (Math.cos(angle) > 0.3) anchor = 'start'
            else if (Math.cos(angle) < -0.3) anchor = 'end'
            return (
              <text
                key={i}
                x={x}
                y={y}
                fontSize={10}
                fill={C_DRIFTWOOD}
                textAnchor={anchor}
              >
                {axis.label}
              </text>
            )
          })}

          {/* Polygons (one per LLM) */}
          {polygons.map((poly) => (
            <path
              key={poly.model}
              d={polygonPath(poly.values)}
              fill={poly.color}
              fillOpacity={0.18}
              stroke={poly.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}

          {/* Center dot */}
          <circle cx={CX} cy={CY} r={1.5} fill={C_INK} />

          {/* Empty state */}
          {polygons.length === 0 && (
            <text x={CX} y={CY + 4} fontSize={11} fill={C_DRIFTWOOD} textAnchor="middle">
              Not enough LLM data to chart.
            </text>
          )}
        </svg>

        {/* Legend */}
        {polygons.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-driftwood">
            {polygons.map((poly) => (
              <span key={poly.model} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: poly.color }}
                />
                {MODEL_LABEL[poly.model] ?? poly.model}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
