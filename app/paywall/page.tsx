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

  let isAuthed = false
  let isFirstPurchase = true

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

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
  } catch (err) {
    // Don't let a Supabase blip take down the paywall — anon-flow defaults
    // (sign-up prompt + intro tier) are a safe degradation.
    console.error('[paywall] supabase fetch failed:', err)
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
          $4 to see how AI <em className="italic text-thistle">actually</em> reads your resume.
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

        <p className="mt-10 text-center text-[12px] text-driftwood/70">
          Credits never expire. One credit = one full report. Refunds within 7 days, no questions asked.
        </p>
      </article>
      <Footer />
    </main>
  )
}

function FounderNote() {
  return (
    <section className="mt-14 mx-auto max-w-xl rounded-2xl border border-thistle/25 bg-paper px-7 py-8 shadow-[0_2px_24px_rgba(132,111,156,0.08)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-thistle/15 flex items-center justify-center font-serif text-[15px] text-thistle">
          J
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-thistle/90">
            A note from the founder
          </p>
          <p className="text-[13px] text-driftwood">Juno A.</p>
        </div>
      </div>
      <div className="text-[16px] text-ink leading-[1.72] space-y-3">
        <p>
          I built tyr because I watched friends get filtered out of jobs they were
          perfectly qualified for — by an AI that didn&rsquo;t think so. It&rsquo;s
          wrong, and it&rsquo;s happening at scale.
        </p>
        <p>
          $4 is the floor I could get to while keeping the lights on (the LLMs aren&rsquo;t
          free). I&rsquo;d rather you actually try it than scroll past.
        </p>
      </div>
    </section>
  )
}
