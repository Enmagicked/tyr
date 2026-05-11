'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import posthog from 'posthog-js'
import { createClient } from '@/lib/supabase/client'

// M7 (KNOWN_ISSUES 2.3): public password-reset request page. Sends a
// recovery email via Supabase Auth → emails currently route through the
// default Supabase SMTP (rate-limited ~3-4/hr; fine for individual recovery,
// not enough for any signup burst — see KNOWN_ISSUES 1.2 for Resend wiring).
//
// Flow:
//   /forgot-password  → submit email → resetPasswordForEmail()
//   email link        → /auth/callback?code=...&next=/account/update-password
//   /account/update-password → user sets new password → /account
//
// M8 follow-up: Supabase enforces a built-in 60s rate limit per email
// address on auth emails. Hammering the resend button silently 200s without
// sending — looks like the form is broken. Surface the cooldown explicitly
// so the user understands they need to wait.

const RESEND_COOLDOWN_SECONDS = 60

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  // Tick down the cooldown once per second whenever it's > 0.
  useEffect(() => {
    if (cooldownRemaining <= 0) return
    const t = setInterval(() => {
      setCooldownRemaining((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [cooldownRemaining])

  async function send() {
    if (cooldownRemaining > 0) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/account/update-password`,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      posthog.capture('password_reset_requested', { email })
      setSent(true)
      setLoading(false)
      setCooldownRemaining(RESEND_COOLDOWN_SECONDS)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-vellum px-6">
      <div className="w-full max-w-sm flex flex-col gap-7">
        <div className="text-center">
          <Link href="/" className="font-serif text-3xl text-ink lowercase tracking-[-0.02em]">
            tyr
          </Link>
          <p className="text-sm text-driftwood mt-2">Reset your password</p>
        </div>

        {sent ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-bone bg-paper p-6 text-center">
              <p className="text-sm text-ink">
                Check <span className="font-medium">{email}</span> for a reset link.
              </p>
              <p className="text-xs text-driftwood mt-2">
                The link expires in 1 hour. Don&apos;t see it? Check spam first.
              </p>
            </div>

            <button
              onClick={send}
              disabled={loading || cooldownRemaining > 0}
              className="rounded-full bg-ink py-2.5 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
            >
              {loading
                ? 'Sending…'
                : cooldownRemaining > 0
                  ? `Resend in ${cooldownRemaining}s`
                  : 'Resend reset link'}
            </button>

            {cooldownRemaining > 0 && (
              <p className="text-[11px] text-driftwood/80 text-center leading-relaxed">
                The mail server limits one reset email per address per minute.
                Requests during the cooldown silently no-op — that&apos;s why
                you saw no second email.
              </p>
            )}
          </div>
        ) : (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email && send()}
              className="rounded-lg border border-bone bg-paper px-4 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20"
            />

            {error && <p className="text-sm text-clay">{error}</p>}

            <button
              onClick={send}
              disabled={loading || !email}
              className="rounded-full bg-ink py-2.5 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}

        <p className="text-sm text-driftwood text-center">
          Remembered it?{' '}
          <Link href="/login" className="text-ink underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
