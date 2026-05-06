// Consensus blocks: top strengths (q3, list) + missing signal (q7, text).
//
// Server component — pure markup. The "consensus" surface picks the modal
// (most-frequent) answer across surviving LLMs. M3+ stores per-(model, query)
// rows; this consolidates them for the user.

interface ConsensusListProps {
  items: string[] | null
  label: string
  caveat?: string
}

interface ConsensusTextProps {
  text: string | null
  label: string
  caveat?: string
}

export function ConsensusList({ items, label, caveat }: ConsensusListProps) {
  if (!items || items.length === 0) {
    return (
      <section className="bg-paper border border-bone rounded-[14px] p-6">
        <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
          {label}
        </div>
        <p className="text-sm text-driftwood">
          Not enough LLMs returned a parseable list.
        </p>
      </section>
    )
  }

  return (
    <section className="bg-paper border border-bone rounded-[14px] p-6">
      <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-4">
        {label}
      </div>
      <ul className="flex flex-col gap-2.5">
        {items.map((s, i) => (
          <li key={i} className="flex gap-3 text-[15px] text-ink leading-[1.6]">
            <span className="text-marigold font-serif text-lg leading-none">•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
      {caveat && (
        <p className="text-xs text-driftwood/70 mt-4 italic">{caveat}</p>
      )}
    </section>
  )
}

export function ConsensusText({ text, label, caveat }: ConsensusTextProps) {
  if (!text) {
    return (
      <section className="bg-paper border border-bone rounded-[14px] p-6">
        <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
          {label}
        </div>
        <p className="text-sm text-driftwood">
          Not enough LLMs returned a parseable answer.
        </p>
      </section>
    )
  }

  return (
    <section className="bg-paper border border-bone rounded-[14px] p-6">
      <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
        {label}
      </div>
      <p className="font-serif italic text-[18px] text-ink leading-[1.6]">{text}</p>
      {caveat && (
        <p className="text-xs text-driftwood/70 mt-4 italic">{caveat}</p>
      )}
    </section>
  )
}
