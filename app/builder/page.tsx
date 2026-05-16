import { redirect } from 'next/navigation'
import { LandingNav } from '@/components/landing/nav'
import { BuilderFlow } from '@/components/builder/builder-flow'
import { CreditsAddedBanner } from '@/components/upload/credits-added-banner'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Builder — tyr',
}

interface PageProps {
  searchParams: Promise<{ from?: string }>
}

export default async function BuilderPage({ searchParams }: PageProps) {
  const { from } = await searchParams

  // Auth-gate only — the actual prefill loads client-side via
  // /api/builder/prefill so the page render isn't blocked by a Haiku
  // LLM call (was making /builder?from=X take 5-10s to TTFB).
  if (from) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect(`/login?next=${encodeURIComponent(`/builder?from=${from}`)}`)
  }

  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <div className="mx-auto max-w-3xl px-6 pt-32 pb-24 md:px-12">
        <div className="mb-12 text-center">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
            Activities → resume
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.08] tracking-[-0.026em]">
            Build it. Score it.{' '}
            <em className="italic text-marigold">Rewrite the weak bullets.</em>
          </h1>
          <p className="mt-4 text-driftwood max-w-lg mx-auto leading-[1.72]">
            Tyr generates one, then immediately runs it through the same
            algorithm that mimics grading real resumes — and lets you hover
            any bullet to surgically rewrite it without breaking the rest.
          </p>
          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-3 text-[12px] text-driftwood/80">
            <span className="rounded-full border border-bone bg-paper px-3 py-1">
              1. <span className="text-ink font-medium">Generate</span> from your activities
            </span>
            <span className="text-driftwood/50">→</span>
            <span className="rounded-full border border-bone bg-paper px-3 py-1">
              2. <span className="text-ink font-medium">Score</span> against the 4 LLMs
            </span>
            <span className="text-driftwood/50">→</span>
            <span className="rounded-full border border-bone bg-paper px-3 py-1">
              3. <span className="text-ink font-medium">🔁 Rewrite</span> up to 5 bullets
            </span>
          </div>
        </div>
        <CreditsAddedBanner />
        <BuilderFlow sourceResumeId={from ?? null} />
      </div>
    </main>
  )
}
