'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function Banner() {
  const params = useSearchParams()
  const added = Number(params.get('credits_added') ?? 0)
  if (!added) return null
  return (
    <div className="mb-8 rounded-xl border border-sage/40 bg-sage/10 px-5 py-3 text-sm text-ink text-center">
      {added} credit{added !== 1 ? 's' : ''} added — you&rsquo;re ready to decode.
    </div>
  )
}

export function CreditsAddedBanner() {
  return (
    <Suspense fallback={null}>
      <Banner />
    </Suspense>
  )
}
