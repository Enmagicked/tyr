import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { LandingNav } from '@/components/landing/nav'
import { Footer } from '@/components/landing/footer'
import { PaywallButtons } from '@/components/paywall/paywall-buttons'

export const metadata = {
  title: 'Get started — tyr',
}

interface PageProps {
  searchParams: Promise<{ from?: string }>
}

export default async function PaywallPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const from = sp.from === 'builder' ? 'builder' : 'upload'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isAuthed = false
  let isFirstPurchase = true

  if (user) {
    isAuthed = true
    const service = createServiceClient()
    const { data: candidate } = await service
      .from('candidates')
      .select('credits_purchased')
      .eq('id', user.id)
      .single()
    isFirstPurchase = ((candidate?.credits_purchased as number | undefined) ?? 0) === 0
  }

  const returnTo = from === 'builder' ? '/builder' : '/upload'

  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <article className="mx-auto max-w-2xl px-6 pt-28 pb-20 md:px-12">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3 text-center">
          Get started
        </p>
        <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.06] tracking-[-0.026em] text-center mb-4">
          $4 to see how AI <em className="italic text-marigold">actually</em> reads your resume.
        </h1>
        <p className="text-driftwood text-center max-w-lg mx-auto leading-[1.72] mb-10">
          Four frontier LLMs and three ATS parsers, scoring your resume in parallel.
          You get the gaps the recruiter-AI sees — and the bullets to fix.
        </p>

        <PaywallButtons
          isAuthed={isAuthed}
          isFirstPurchase={isFirstPurchase}
          returnTo={returnTo}
        />

        <FounderNote />

        <p className="mt-12 text-center text-[12px] text-driftwood/70">
          Credits never expire. One credit = one full report. Refunds within 7 days, no questions asked.
        </p>
      </article>
      <Footer />
    </main>
  )
}

function FounderNote() {
  return (
    <section className="mt-14 mx-auto max-w-md border-t border-bone pt-8">
      <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3 text-center">
        Note from the founder
      </p>
      <div className="text-[15px] text-ink/90 leading-[1.75] space-y-3">
        <p>
          This is real. I built tyr because I watched friends get filtered out
          of jobs they were perfectly qualified for — by an AI that didn’t
          think so. It’s wrong, and it’s happening at scale.
        </p>
        <p>
          $4 is the floor I could get to while keeping the lights on (the
          LLMs aren’t free). I’d rather you actually try it than scroll past.
        </p>
      </div>
      <p className="mt-5 text-[13px] text-ink/70 text-right italic">— Juno A., founder</p>
    </section>
  )
}
