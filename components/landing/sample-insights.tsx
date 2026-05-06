// Three sample-quote cards. Server component. Quotes preserved verbatim from
// the design — they don't make false claims about the system.

const QUOTES = [
  {
    text: '"Candidate presents as technically capable but lacks evidence of cross-functional leadership or measurable impact."',
    from: 'GPT-4o recruiter brief',
    accent: 'border-l-clay',
  },
  {
    text: '"Contact block failed to parse — email not extracted. Candidate likely filtered before scoring."',
    from: 'ATS parser log',
    accent: 'border-l-sage',
  },
  {
    text: '"Seniority read: mid-level. Applicant used no quantified outcomes in 6 of 7 bullet points."',
    from: 'Claude perception summary',
    accent: 'border-l-marigold',
  },
]

export function SampleInsights() {
  return (
    <section className="bg-vellum px-6 md:px-12 py-24 md:py-28">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-16">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
            Sample findings
          </p>
          <h2 className="font-serif text-[clamp(26px,3.5vw,48px)] text-ink leading-[1.08] tracking-[-0.026em]">
            What the machines actually say
          </h2>
        </div>
        <div className="flex flex-col gap-3.5">
          {QUOTES.map((q, i) => (
            <div
              key={i}
              className={`bg-dune border border-bone border-l-[2.5px] ${q.accent} rounded-[12px] px-8 py-7`}
            >
              <p className="font-serif italic text-[clamp(16px,1.8vw,20px)] text-ink leading-[1.65] mb-3">
                {q.text}
              </p>
              <div className="text-[11px] font-semibold tracking-[0.1em] uppercase text-driftwood">
                {q.from}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
