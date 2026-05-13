import { LandingNav } from '@/components/landing/nav'
import { BuilderFlow } from '@/components/builder/builder-flow'
import { CreditsAddedBanner } from '@/components/upload/credits-added-banner'

export const metadata = {
  title: 'Builder — tyr',
}

export default function BuilderPage() {
  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <div className="mx-auto max-w-3xl px-6 pt-32 pb-24 md:px-12">
        <div className="mb-12 text-center">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
            Activities → resume
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.08] tracking-[-0.026em]">
            Build it. Score it. Tighten it.
          </h1>
          <p className="mt-4 text-driftwood max-w-md mx-auto leading-[1.72]">
            Tell us what you&apos;ve done. We generate a resume, then run it
            through the same 4 recruiter-AIs from the analyzer so you can see
            exactly which bullets land.
          </p>
        </div>
        <CreditsAddedBanner />
        <BuilderFlow />
      </div>
    </main>
  )
}
