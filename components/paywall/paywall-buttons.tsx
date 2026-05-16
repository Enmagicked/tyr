'use client'

import { useState } from 'react'
import Link from 'next/link'
import posthog from 'posthog-js'

interface PaywallButtonsProps {
  isAuthed: boolean
  isFirstPurchase: boolean
  returnTo: string
}

type Tier = 'intro' | 'single' | 'bulk'

export function PaywallButtons({ isAuthed, isFirstPurchase, returnTo }: PaywallButtonsProps) {
  const [loading, setLoading] = useState<Tier | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function buy(tier: Tier) {
    if (!isAuthed) {
      window.location.href = `/signup?next=${encodeURIComponent('/paywall?from=' + (returnTo === '/builder' ? 'builder' : 'upload'))}`
      return
    }
    setLoading(tier)
    setErrorMsg('')
    posthog.capture('checkout_started', { tier, from: 'paywall_page' })
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, return_to: returnTo }),
      })
      const { url, error } = await res.json()
      if (!res.ok || !url) throw new Error(error ?? 'Could not start checkout')
      window.location.href = url
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed')
      setLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="flex flex-col gap-3">
        {isFirstPurchase ? (
          <button
            onClick={() => buy('intro')}
            disabled={loading !== null}
            className="w-full rounded-2xl bg-marigold px-6 py-5 text-left hover:brightness-105 disabled:opacity-50 transition-all"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-serif text-2xl text-ink">Intro · 1 decode</span>
              <span className="font-serif text-2xl text-ink">$4</span>
            </div>
            <p className="text-[12px] text-ink/70 mt-1">
              {loading === 'intro' ? 'Opening Stripe…' : 'First-time only. See what your resume actually looks like to AI.'}
            </p>
          </button>
        ) : (
          <button
            onClick={() => buy('single')}
            disabled={loading !== null}
            className="w-full rounded-2xl border border-bone bg-paper px-6 py-5 text-left hover:bg-bone/40 disabled:opacity-50 transition-colors"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-serif text-2xl text-ink">1 decode</span>
              <span className="font-serif text-2xl text-ink">$6</span>
            </div>
            <p className="text-[12px] text-driftwood mt-1">
              {loading === 'single' ? 'Opening Stripe…' : 'A single full report.'}
            </p>
          </button>
        )}
        <button
          onClick={() => buy('bulk')}
          disabled={loading !== null}
          className="w-full rounded-2xl border border-bone bg-paper px-6 py-5 text-left hover:bg-bone/40 disabled:opacity-50 transition-colors"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-serif text-2xl text-ink">5 decodes</span>
            <span className="font-serif text-2xl text-ink">$15</span>
          </div>
          <p className="text-[12px] text-driftwood mt-1">
            {loading === 'bulk' ? 'Opening Stripe…' : 'For iterating: rewrite, re-score, repeat. $3 each.'}
          </p>
        </button>
      </div>

      {!isAuthed && (
        <p className="mt-4 text-center text-[12px] text-driftwood">
          You’ll create an account first.{' '}
          <Link href="/login" className="text-ink underline">Already have one?</Link>
        </p>
      )}

      {errorMsg && (
        <p className="mt-3 text-center text-sm text-clay">{errorMsg}</p>
      )}
    </div>
  )
}
