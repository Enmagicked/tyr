// M8.D chart 3/3: per-field parser-agreement horizontal bars.
//
// Each canonical resume field (name, email, phone, experience, education,
// skills, …) gets one row showing how much the surviving parsers agreed
// on that field's value. 1.0 = identical canonical output across parsers,
// 0.0 = wholly different. Visually mirrors the σ/ρ grid layout but more
// glanceable — green = agreement, clay = disagreement.
//
// Pure SVG, server-renderable. Pairs inside the existing
// ParserDisagreementCard (above the field-by-field text list).

interface ParserAgreementBarsProps {
  // Same shape as parse_disagreement.field_disagreement: 0..1 disagreement
  // per canonical field. Higher = more disagreement.
  fieldDisagreement: Record<string, number> | null
  nParsers: number
}

// Friendly labels for the canonical field paths the disagreement scorer
// uses. Anything not in this map renders as the raw key (forward-compat).
const FIELD_LABELS: Record<string, string> = {
  'name':                'Name',
  'contact.email':       'Email',
  'contact.phone':       'Phone',
  'contact.linkedin':    'LinkedIn',
  'contact.github':      'GitHub',
  'experience':          'Experience',
  'experience.employer': 'Employer (per role)',
  'experience.title':    'Title (per role)',
  'experience.dates':    'Dates (per role)',
  'experience.bullets':  'Bullets (per role)',
  'education':           'Education',
  'education.school':    'School',
  'education.degree':    'Degree',
  'skills':              'Skills',
}

// Display order for known fields. Unknown fields fall to the end alphabetically.
const FIELD_ORDER = [
  'name',
  'contact.email',
  'contact.phone',
  'contact.linkedin',
  'contact.github',
  'experience',
  'experience.employer',
  'experience.title',
  'experience.dates',
  'experience.bullets',
  'education',
  'education.school',
  'education.degree',
  'skills',
]

const ROW_H = 22
const BAR_H = 8
const W = 480
const PAD_LEFT = 150
const PAD_RIGHT = 56     // room for the % label
const BAR_W = W - PAD_LEFT - PAD_RIGHT

const C_BONE = '#E5DFCF'
const C_DRIFTWOOD = '#6E6358'
const C_INK = '#1E1812'
const C_SAGE = '#7E967A'   // agreement
const C_CLAY = '#C58569'   // disagreement
const C_MARIGOLD = '#F0B85C'

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`
}

// Sort fields: known order first, then unknown fields alphabetically.
function sortedFieldKeys(keys: string[]): string[] {
  const known = FIELD_ORDER.filter((k) => keys.includes(k))
  const unknown = keys.filter((k) => !FIELD_ORDER.includes(k)).sort()
  return [...known, ...unknown]
}

// Color interpolation: green at 100% agreement, marigold at 50%, clay at 0%.
// Keeps the 3-color palette consistent with the rest of the report.
function barColor(agreement: number): string {
  if (agreement >= 0.7) return C_SAGE
  if (agreement >= 0.4) return C_MARIGOLD
  return C_CLAY
}

export function ParserAgreementBars({ fieldDisagreement, nParsers }: ParserAgreementBarsProps) {
  const entries = fieldDisagreement
    ? sortedFieldKeys(Object.keys(fieldDisagreement)).map((key) => ({
        key,
        agreement: 1 - (fieldDisagreement[key] ?? 0),
      }))
    : []

  if (entries.length === 0) {
    return (
      <div className="text-xs text-driftwood italic">
        Not enough parser data to chart agreement per field.
      </div>
    )
  }

  const H = entries.length * ROW_H + 12

  return (
    <div className="rounded-lg border border-bone bg-vellum/40 p-3">
      <div className="flex items-baseline justify-between gap-3 mb-2 px-1">
        <div className="text-[11px] uppercase tracking-[0.12em] text-driftwood">
          Per-field agreement
        </div>
        <div className="text-[11px] text-driftwood">
          {nParsers} of 2 parsers · longer green bar = better
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="auto"
        role="img"
        aria-label="Per-field parser agreement chart"
      >
        {entries.map((entry, i) => {
          const y = 10 + i * ROW_H
          const barX = PAD_LEFT
          const barFillW = BAR_W * entry.agreement
          const color = barColor(entry.agreement)
          return (
            <g key={entry.key}>
              {/* Field label */}
              <text
                x={PAD_LEFT - 8}
                y={y + BAR_H / 2 + 3.5}
                fontSize={10}
                fill={C_INK}
                textAnchor="end"
              >
                {FIELD_LABELS[entry.key] ?? entry.key}
              </text>
              {/* Track */}
              <rect
                x={barX}
                y={y}
                width={BAR_W}
                height={BAR_H}
                rx={BAR_H / 2}
                fill={C_BONE}
              />
              {/* Filled portion */}
              <rect
                x={barX}
                y={y}
                width={barFillW}
                height={BAR_H}
                rx={BAR_H / 2}
                fill={color}
              />
              {/* % label */}
              <text
                x={W - PAD_RIGHT + 8}
                y={y + BAR_H / 2 + 3.5}
                fontSize={10}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill={C_DRIFTWOOD}
              >
                {fmtPct(entry.agreement)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
