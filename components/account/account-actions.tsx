'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import posthog from 'posthog-js'

export function AccountBuyCredits() {
  const [loading, setLoading] = useState<1 | 5 | null>(null)

  async function buy(credits: 1 | 5) {
    setLoading(credits)
    posthog.capture('checkout_started', { credit_count: credits })
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits }),
      })
      const { url, error } = await res.json()
      if (!res.ok || !url) throw new Error(error ?? 'Could not start checkout')
      window.location.href = url
    } catch (err) {
      console.error('checkout error:', err)
      setLoading(null)
    }
  }

  return (
    <div className="flex gap-2 flex-shrink-0">
      <button
        onClick={() => buy(1)}
        disabled={loading !== null}
        className="text-[13px] font-medium px-4 py-2 rounded-full border border-bone bg-vellum/50 text-ink hover:bg-bone disabled:opacity-50 transition-colors"
      >
        {loading === 1 ? '…' : '1 decode · $6'}
      </button>
      <button
        onClick={() => buy(5)}
        disabled={loading !== null}
        className="text-[13px] font-medium px-4 py-2 rounded-full bg-ink text-vellum hover:bg-ink/90 disabled:opacity-50 transition-colors"
      >
        {loading === 5 ? '…' : '5 decodes · $15'}
      </button>
    </div>
  )
}

interface AccountActionsProps {
  email: string
}

export function AccountActions({ email }: AccountActionsProps) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [typedEmail, setTypedEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function signOut() {
    setSigningOut(true)
    posthog.capture('user_signed_out')
    posthog.reset()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  async function deleteEverything() {
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error ?? body.detail ?? `HTTP ${res.status}`)
      }
      // After server-side cleanup, sign out the local session and redirect.
      posthog.capture('account_deleted')
      posthog.reset()
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/')
      router.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  const typedMatch = typedEmail.trim().toLowerCase() === email.trim().toLowerCase()

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-paper border border-bone rounded-[14px] p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-serif text-[18px] text-ink mb-0.5">Sign out</p>
          <p className="text-xs text-driftwood">
            Ends this session. Your reports stay in tyr.
          </p>
        </div>
        <button
          onClick={signOut}
          disabled={signingOut}
          className="text-[13px] font-medium px-4 py-2 rounded-full border border-bone bg-vellum/50 text-ink hover:bg-bone disabled:opacity-50 transition-colors flex-shrink-0"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>

      <div className="border border-clay/30 rounded-[14px] p-5 bg-clay/5">
        <p className="font-serif text-[18px] text-ink mb-1">
          Delete all my data
        </p>
        <p className="text-xs text-driftwood mb-4">
          Permanently removes your account, every uploaded resume, every
          parser run, every LLM response, and every cached embedding. This
          cannot be undone.
        </p>

        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="text-[13px] font-medium px-4 py-2 rounded-full border border-clay/40 bg-clay/10 text-clay hover:bg-clay/20 transition-colors"
          >
            I want to delete everything
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-driftwood">
                Type <span className="font-mono text-ink">{email}</span> to confirm:
              </span>
              <input
                type="text"
                value={typedEmail}
                onChange={(e) => setTypedEmail(e.target.value)}
                placeholder={email}
                disabled={deleting}
                autoComplete="off"
                className="rounded-lg border border-bone bg-paper px-3 py-2 text-sm font-mono focus:outline-none focus:border-clay/60 focus:ring-2 focus:ring-clay/20"
              />
            </label>
            {deleteError && (
              <p className="text-xs text-clay">Error: {deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDelete(false)
                  setTypedEmail('')
                  setDeleteError('')
                }}
                disabled={deleting}
                className="text-[13px] font-medium px-4 py-2 rounded-full border border-bone bg-vellum/50 text-ink hover:bg-bone transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteEverything}
                disabled={!typedMatch || deleting}
                className="text-[13px] font-medium px-4 py-2 rounded-full bg-clay text-vellum hover:bg-clay/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
