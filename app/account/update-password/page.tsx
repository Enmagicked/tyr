'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import posthog from 'posthog-js'
import { createClient } from '@/lib/supabase/client'

// M7 (KNOWN_ISSUES 2.3): user lands here after the recovery email link
// → /auth/callback?code=...&next=/account/update-password.
// The callback route already exchanged the code for a session, so the user
// is signed in by the time this page renders.
//
// Auth gate: lives under /account/* which is in proxy.ts PROTECTED_PREFIXES,
// so an unauthed visitor is redirected to /login first.
const MIN_PASSWORD_LENGTH = 6

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const mismatch = confirm.length > 0 && password !== confirm
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH

  async function update() {
    if (mismatch || tooShort || password.length === 0) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      posthog.capture('password_updated')
      router.push('/account')
      router.refresh()
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-vellum px-6">
      <div className="w-full max-w-sm flex flex-col gap-7">
        <div className="text-center">
          <Link href="/" className="font-serif text-3xl text-ink lowercase tracking-[-0.02em]">
            tyr
          </Link>
          <p className="text-sm text-driftwood mt-2">Set a new password</p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-bone bg-paper px-4 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && update()}
            className="rounded-lg border border-bone bg-paper px-4 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20"
          />
        </div>

        {tooShort && (
          <p className="text-sm text-clay">Password must be at least {MIN_PASSWORD_LENGTH} characters.</p>
        )}
        {mismatch && (
          <p className="text-sm text-clay">Passwords don&apos;t match.</p>
        )}
        {error && <p className="text-sm text-clay">{error}</p>}

        <button
          onClick={update}
          disabled={loading || mismatch || tooShort || password.length === 0}
          className="rounded-full bg-ink py-2.5 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </main>
  )
}
