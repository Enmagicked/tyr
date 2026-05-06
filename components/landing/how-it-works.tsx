// Three-step explainer panel. Server component — copy is verbatim from M4
// plan §"HowItWorks step cards".

const STEPS = [
  {
    n: '1',
    title: 'Upload',
    body: 'Drop your PDF. tyr accepts any layout — multi-column, tables, exotic fonts.',
    accent: 'border-t-sage',
    numColor: 'text-sage',
  },
  {
    n: '2',
    title: 'Parallel analysis',
    body: 'Three parsers and four LLMs run simultaneously, exactly like the hiring stacks you will apply to.',
    accent: 'border-t-marigold',
    numColor: 'text-marigold',
  },
  {
    n: '3',
    title: 'Your judgment',
    body: 'Disagreement scored, σ and ρ surfaced, AI-legibility quantified, and concrete edits flagged for both reports.',
    accent: 'border-t-clay',
    numColor: 'text-clay',
  },
]

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="bg-vellum px-6 md:px-12 py-24 md:py-28"
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16 md:mb-20">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
            Three steps
          </p>
          <h2 className="font-serif text-[clamp(28px,4vw,52px)] text-ink leading-[1.08] tracking-[-0.026em]">
            Upload. Analyze. Understand.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={`bg-dune border border-bone border-t-[2.5px] ${s.accent} rounded-[12px] p-9`}
            >
              <div
                className={`font-serif text-5xl ${s.numColor} mb-4 leading-none`}
              >
                {s.n}
              </div>
              <h3 className="font-serif text-[22px] text-ink mb-3 font-normal">
                {s.title}
              </h3>
              <p className="text-sm text-driftwood leading-[1.78]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
