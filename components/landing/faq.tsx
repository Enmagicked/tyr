'use client'

import { useId, useState } from 'react'

// 5 FAQ items with verbatim copy from M4 plan §"FAQ".
const ITEMS = [
  {
    q: 'Which AI models does tyr use?',
    a: 'Four heterogeneous frontier LLMs — GPT-4o, Claude Sonnet, Gemini, and Llama 3.1 70B. Each receives the same eight structured queries about your resume. We measure numerical disagreement (σ across scalar judgments) and reasoning dispersion (ρ across embedded explanations). Disagreement is treated as a calibrated uncertainty signal, not noise.',
  },
  {
    q: 'How does the ATS analysis work?',
    a: "Three independent parsers run in parallel — Affinda's commercial NER, the open-source OpenResume engine, and our own deterministic extractor. We normalize their outputs into a canonical schema and score where they diverge. High parser disagreement is itself a finding: it predicts that real-world ATSes will read your resume inconsistently.",
  },
  {
    q: 'What does disagreement actually tell me?',
    a: 'Two readings. High σ on a scalar query (e.g. seniority) means LLM-powered screeners will reach different conclusions about you depending on which one they use — your resume reads ambiguously. High ρ on reasoning text means the models are looking at different signals to arrive at their answer — your resume is multi-interpretable. Both are addressable with concrete edits.',
  },
  {
    q: 'Is my resume stored?',
    a: 'Yes — encrypted at rest in a row-level-security-isolated Postgres instance keyed to your account. You can delete it at any time. We never train models on user data and never share your resume with third parties.',
  },
  {
    q: 'How accurate is this?',
    a: 'The disagreement score is robust by construction — if three parsers extract the same field, real ATSes overwhelmingly will too. The σ and ρ metrics are calibrated against a 5,000-resume reference distribution. We do not claim to predict any specific employer’s hiring decision; we measure how the AI layer of the funnel reads you, with explicit uncertainty.',
  },
]

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null)
  const baseId = useId()

  return (
    <section id="faq" className="bg-dune px-6 md:px-12 py-24 md:py-28">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-16">
          <h2 className="font-serif text-[clamp(26px,3.5vw,48px)] text-ink leading-[1.08] tracking-[-0.026em]">
            Questions
          </h2>
        </div>
        <ul role="list" className="border-t border-bone">
          {ITEMS.map((item, i) => {
            const isOpen = open === i
            const buttonId = `${baseId}-q-${i}`
            const panelId = `${baseId}-a-${i}`
            return (
              <li key={i} className="border-b border-bone">
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpen(isOpen ? null : i)
                    }
                  }}
                  className="w-full flex items-center justify-between gap-4 py-6 text-left bg-transparent border-0 cursor-pointer font-serif text-[20px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-thistle/40 focus-visible:rounded-md"
                >
                  <span>{item.q}</span>
                  <span
                    aria-hidden="true"
                    className={`text-[22px] text-driftwood leading-none flex-shrink-0 transition-transform duration-300 ${
                      isOpen ? 'rotate-45' : ''
                    }`}
                  >
                    +
                  </span>
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="overflow-hidden"
                >
                  <p className="text-[15px] text-driftwood leading-[1.78] pb-6">
                    {item.a}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
