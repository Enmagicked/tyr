// Single source of truth for the placeholder-weights caveat. M5 retires this
// card by either removing it or replacing the copy once weights are learned.

import { AI_LEGIBILITY_CAVEAT_COPY } from '@/lib/agents/ai-legibility'

export function CaveatCard() {
  return (
    <section className="border border-dashed border-driftwood/30 rounded-[12px] px-6 py-5 bg-vellum/40">
      <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-2">
        Caveat
      </div>
      <p className="text-sm text-driftwood leading-relaxed">
        {AI_LEGIBILITY_CAVEAT_COPY} The σ and ρ metrics on the right are
        direct measurements and do not depend on those weights — they are
        reliable today.
      </p>
    </section>
  )
}
