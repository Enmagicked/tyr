// Two-card mock of what the real /report page shows. Verbatim labels per
// M4 plan §"ReportPreview cards" — these are illustrative, not from a real
// resume.

const CARDS = [
  {
    accentClass: 'border-t-sage',
    accentBg: 'bg-sage/15',
    accentText: 'text-sage',
    badge: 'Structural parse',
    title: 'ATS Report',
    score: '87% agreement',
    rows: [
      { label: 'Contact parsed', val: '3 / 3 sources', tone: 'good' as const },
      { label: 'Date alignment', val: '92%', tone: 'good' as const },
      { label: 'Bullet count variance', val: 'Low', tone: 'good' as const },
      { label: 'Inter-modal δ', val: '0.4 (mild gap)', tone: 'warn' as const },
    ],
  },
  {
    accentClass: 'border-t-clay',
    accentBg: 'bg-clay/15',
    accentText: 'text-clay',
    badge: 'AI interpretation',
    title: 'AI Perception Report',
    score: '74 / 100',
    rows: [
      {
        label: 'Recruiter summary',
        val: '"Mid-level engineer, backend focus"',
        tone: 'good' as const,
      },
      {
        label: 'Seniority σ',
        val: '1.2 across 4 models',
        tone: 'warn' as const,
      },
      { label: 'Reasoning ρ', val: '0.18 (low dispersion)', tone: 'good' as const },
      { label: 'Top fix', val: 'Quantify 3 bullet points', tone: 'good' as const },
    ],
  },
]

function toneClass(tone: 'good' | 'warn' | 'neutral'): string {
  if (tone === 'good') return 'text-sage'
  if (tone === 'warn') return 'text-clay'
  return 'text-ink'
}

export function ReportPreview() {
  return (
    <section className="bg-dune px-6 md:px-12 py-24 md:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
            What you get
          </p>
          <h2 className="font-serif text-[clamp(28px,4vw,52px)] text-ink leading-[1.08] tracking-[-0.026em] mb-4">
            Two reports. One upload.
          </h2>
          <p className="text-driftwood max-w-md mx-auto leading-[1.72]">
            The structural reality and the interpretive read — side by side.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {CARDS.map((card) => (
            <div
              key={card.title}
              className={`bg-paper border border-bone border-t-[2.5px] ${card.accentClass} rounded-[14px] overflow-hidden`}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-bone">
                <div>
                  <div
                    className={`text-[10px] tracking-[0.12em] uppercase mb-1 ${card.accentText}`}
                  >
                    {card.badge}
                  </div>
                  <div className="font-serif text-[22px] text-ink">
                    {card.title}
                  </div>
                </div>
                <div
                  className={`rounded-full px-3.5 py-1 text-xs font-medium ${card.accentBg} ${card.accentText} border border-current/20`}
                >
                  {card.score}
                </div>
              </div>
              {card.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-bone last:border-b-0"
                >
                  <span className="text-[13px] text-driftwood">
                    {row.label}
                  </span>
                  <span
                    className={`text-[13px] font-medium text-right ${toneClass(row.tone)}`}
                  >
                    {row.val}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
