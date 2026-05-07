// M5 plain-English summary: 4 sectioned cards rendering Claude's synthesis
// of the disagreement data + bullet metrics.
//
// Server component. Lives at the bottom of /report/[resumeId] per M5 plan:
// "tables on top, summary additionally" — readers who want technical detail
// scroll up; readers who want narrative read this section.

import type { PlainSummary } from '@/lib/agents/synthesize-summary'

interface PlainSummaryProps {
  summary: PlainSummary | null
}

const SECTIONS: Array<{
  title: string
  paragraphKey: 'ats_paragraph' | 'experience_paragraph' | 'ai_consensus_paragraph'
  borderClass: string
  accentText: string
  accentBg: string
}> = [
  {
    title: 'What the parsers saw',
    paragraphKey: 'ats_paragraph',
    borderClass: 'border-t-sage',
    accentText: 'text-sage',
    accentBg: 'bg-sage/10',
  },
  {
    title: 'Your experience bullets',
    paragraphKey: 'experience_paragraph',
    borderClass: 'border-t-marigold',
    accentText: 'text-marigold',
    accentBg: 'bg-marigold/15',
  },
  {
    title: 'How the AIs read you',
    paragraphKey: 'ai_consensus_paragraph',
    borderClass: 'border-t-clay',
    accentText: 'text-clay',
    accentBg: 'bg-clay/10',
  },
]

export function PlainSummarySection({ summary }: PlainSummaryProps) {
  if (!summary) {
    return (
      <section className="bg-paper border border-bone rounded-[14px] p-6">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
          Your judgment, in plain English
        </p>
        <p className="text-sm text-driftwood">
          Summary unavailable for this resume — likely because the AI synthesis
          step timed out or no LLMs responded. Refresh and re-upload to retry.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
          Your judgment, in plain English
        </p>
        <h2 className="font-serif text-3xl text-ink leading-[1.08] tracking-[-0.026em]">
          The narrative version
        </h2>
        <p className="text-sm text-driftwood mt-2 max-w-2xl">
          Plain-language explanation of the data above, with the specific
          numbers from your resume. The tables remain authoritative — this
          section translates them.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s) => {
          const text = summary[s.paragraphKey]
          if (!text) return null
          return (
            <div
              key={s.paragraphKey}
              className={`bg-paper border border-bone border-t-[2.5px] ${s.borderClass} rounded-[14px] p-6 flex flex-col gap-3`}
            >
              <div
                className={`inline-flex self-start text-[10px] font-semibold tracking-[0.18em] uppercase px-2.5 py-0.5 rounded-full ${s.accentBg} ${s.accentText}`}
              >
                {s.title}
              </div>
              <p className="font-serif text-[17px] leading-[1.72] text-ink">{text}</p>
            </div>
          )
        })}

        {/* Recommendations card spans full width on the right column when
            present, or full grid otherwise. */}
        {summary.recommendations && summary.recommendations.length > 0 && (
          <div className="bg-paper border border-bone border-t-[2.5px] border-t-thistle rounded-[14px] p-6 md:col-span-2 flex flex-col gap-3">
            <div className="inline-flex self-start text-[10px] font-semibold tracking-[0.18em] uppercase px-2.5 py-0.5 rounded-full bg-thistle/15 text-thistle">
              {summary.recommendations.length === 3
                ? 'Three things to fix'
                : 'Edits to consider'}
            </div>
            <ol className="space-y-3 list-decimal list-inside font-serif text-[17px] leading-[1.65] text-ink marker:font-sans marker:text-driftwood marker:text-sm">
              {summary.recommendations.map((rec, i) => (
                <li key={i}>
                  <span className="ml-2">{rec}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  )
}
