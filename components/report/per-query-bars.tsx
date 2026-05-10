// M8.D chart 1/3: per-scalar-query bar chart with σ error bars.
//
// 5 bars covering the scalar perception queries (seniority, technical_depth,
// fit, final_round_probability, ai_authored). Each bar's height is the mean
// score normalized to [0,1] so 1-10 queries and 0-1 queries share one axis.
// The σ error bar overlays the bar, scaled to the same normalized space, so
// a wide σ visibly says "the LLMs disagreed" at a glance.
//
// Pure SVG, server-renderable, no interactions. Pairs with the existing
// PerceptionGrid (which has the full numeric breakdown including ρ).

interface PerQueryBarsProps {
  // Same `features` map as PerceptionGrid — keys like `mean_seniority`,
  // `sigma_seniority`, `mean_final_round_prob`, etc.
  features: Record<string, number | null>
  nLLMs: number
}

interface BarSpec {
  key: string
  label: string
  meanField: string
  sigmaField: string
  // Range used to normalize mean to [0,1]
  range: [number, number]
  // Display suffix for the value label above the bar
  unit: string
}

const BARS: BarSpec[] = [
  { key: 'seniority',               label: 'Seniority',         meanField: 'mean_seniority',         sigmaField: 'sigma_seniority',         range: [1, 10], unit: '/10' },
  { key: 'technical_depth',         label: 'Technical depth',   meanField: 'mean_technical_depth',   sigmaField: 'sigma_technical_depth',   range: [1, 10], unit: '/10' },
  { key: 'fit',                     label: 'Role fit',          meanField: 'mean_fit',               sigmaField: 'sigma_fit',               range: [1, 10], unit: '/10' },
  { key: 'final_round_probability', label: 'Final-round prob',  meanField: 'mean_final_round_prob',  sigmaField: 'sigma_final_round_prob',  range: [0, 1],  unit: '' },
  { key: 'ai_authored',             label: 'AI-authored prob',  meanField: 'mean_ai_authored',       sigmaField: 'sigma_ai_authored',       range: [0, 1],  unit: '' },
]

// Layout constants (px). Sized so the SVG sits comfortably in a half-width
// card on desktop and stacks readably on mobile.
const W = 480
const H = 240
const PAD_TOP = 28           // room for value labels above bars
const PAD_BOTTOM = 56        // room for x-axis labels (some are long)
const PAD_LEFT = 32          // room for y-axis ticks
const PAD_RIGHT = 16
const PLOT_W = W - PAD_LEFT - PAD_RIGHT
const PLOT_H = H - PAD_TOP - PAD_BOTTOM
const BAR_GAP_RATIO = 0.35   // 35% of slot is gap, 65% is bar
const SLOT_W = PLOT_W / BARS.length
const BAR_W = SLOT_W * (1 - BAR_GAP_RATIO)

// Palette pulled from app/globals.css custom properties.
const C_INK = '#1E1812'
const C_BONE = '#E5DFCF'
const C_DRIFTWOOD = '#6E6358'
const C_MARIGOLD = '#F0B85C'
const C_THISTLE = '#846F9C'
const C_PAPER = '#FDFAF5'

function normalize(value: number, [lo, hi]: [number, number]): number {
  if (hi === lo) return 0
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)))
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

export function PerQueryBars({ features, nLLMs }: PerQueryBarsProps) {
  return (
    <div className="bg-paper border border-bone border-t-[2.5px] border-t-marigold rounded-[14px] overflow-hidden">
      <div className="px-6 py-5 border-b border-bone">
        <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-marigold mb-1">
          Per-query scoreboard
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-serif text-2xl text-ink">Means + σ at a glance</div>
          <span className="text-xs text-driftwood">
            {nLLMs} of 4 LLMs · σ shown as error bar
          </span>
        </div>
      </div>
      <div className="px-3 py-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="auto"
          role="img"
          aria-label="Per-query mean scores with sigma error bars"
        >
          {/* Horizontal grid lines + y-axis ticks at 0, 0.25, 0.5, 0.75, 1 */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = PAD_TOP + (1 - t) * PLOT_H
            return (
              <g key={t}>
                <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={y} y2={y} stroke={C_BONE} strokeWidth={1} />
                <text x={PAD_LEFT - 6} y={y + 3} fontSize={9} fill={C_DRIFTWOOD} textAnchor="end">
                  {t.toFixed(2)}
                </text>
              </g>
            )
          })}

          {/* Bars + error bars + value labels */}
          {BARS.map((bar, i) => {
            const meanRaw = features[bar.meanField] ?? null
            const sigmaRaw = features[bar.sigmaField] ?? null
            const meanNorm = meanRaw === null ? null : normalize(meanRaw, bar.range)
            // σ in normalized space: divide by range width so a σ of 1 on a
            // 1-10 scale shows the same visual extent as a σ of 0.1 on a 0-1
            // scale (both = 1/9 and 0.1 of axis respectively — close enough).
            const rangeWidth = bar.range[1] - bar.range[0]
            const sigmaNorm = sigmaRaw === null ? null : Math.max(0, Math.min(1, sigmaRaw / rangeWidth))

            const slotX = PAD_LEFT + i * SLOT_W
            const barX = slotX + (SLOT_W - BAR_W) / 2
            const barH = meanNorm === null ? 0 : meanNorm * PLOT_H
            const barY = PAD_TOP + (PLOT_H - barH)

            // Error bar centered on the top of the bar (the mean), spanning
            // ±σ in normalized space. Clamp so it stays inside plot region.
            const errCenter = barY
            const errTop = sigmaNorm === null ? errCenter : Math.max(PAD_TOP, errCenter - sigmaNorm * PLOT_H)
            const errBot = sigmaNorm === null ? errCenter : Math.min(PAD_TOP + PLOT_H, errCenter + sigmaNorm * PLOT_H)
            const errCapW = BAR_W * 0.4

            return (
              <g key={bar.key}>
                {/* Bar (thistle for the mean) */}
                {meanNorm !== null && (
                  <rect
                    x={barX}
                    y={barY}
                    width={BAR_W}
                    height={barH}
                    fill={C_THISTLE}
                    opacity={0.85}
                    rx={2}
                  />
                )}

                {/* Error bar (only when σ available — needs ≥2 LLM responses) */}
                {sigmaNorm !== null && meanNorm !== null && (
                  <g stroke={C_INK} strokeWidth={1.25} strokeLinecap="round" fill="none">
                    {/* Vertical line */}
                    <line x1={barX + BAR_W / 2} x2={barX + BAR_W / 2} y1={errTop} y2={errBot} />
                    {/* Top cap */}
                    <line x1={barX + BAR_W / 2 - errCapW / 2} x2={barX + BAR_W / 2 + errCapW / 2} y1={errTop} y2={errTop} />
                    {/* Bottom cap */}
                    <line x1={barX + BAR_W / 2 - errCapW / 2} x2={barX + BAR_W / 2 + errCapW / 2} y1={errBot} y2={errBot} />
                  </g>
                )}

                {/* Value label above the bar */}
                <text
                  x={barX + BAR_W / 2}
                  y={barY - 8}
                  fontSize={11}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill={C_INK}
                  textAnchor="middle"
                >
                  {fmt(meanRaw, bar.range[1] === 10 ? 1 : 2)}{bar.unit}
                </text>

                {/* X-axis label below — split long labels over 2 lines */}
                <text
                  x={barX + BAR_W / 2}
                  y={PAD_TOP + PLOT_H + 16}
                  fontSize={10}
                  fill={C_DRIFTWOOD}
                  textAnchor="middle"
                >
                  {bar.label}
                </text>
              </g>
            )
          })}

          {/* Empty-state hint when no LLMs responded */}
          {nLLMs === 0 && (
            <text x={W / 2} y={H / 2} fontSize={12} fill={C_DRIFTWOOD} textAnchor="middle">
              No LLM responses to chart yet.
            </text>
          )}

          {/* Subtle background tint inside plot region */}
          <rect
            x={PAD_LEFT}
            y={PAD_TOP}
            width={PLOT_W}
            height={PLOT_H}
            fill={C_PAPER}
            opacity={0}
            pointerEvents="none"
          />
        </svg>
      </div>
    </div>
  )
}
