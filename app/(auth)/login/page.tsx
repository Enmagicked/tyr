'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState<'signing' | 'redirecting' | null>(null)
  const search = useSearchParams()
  const next = search.get('next') ?? '/upload'
  const otpExpired = search.get('error') === 'otp_expired'

  async function login() {
    setLoading('signing')
    setError('')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(null)
      return
    }
    if (data.user) {
      posthog.identify(data.user.id, { email: data.user.email })
      posthog.capture('user_logged_in', { email: data.user.email })
    }
    // Hard navigation — Next router.push() leaves the button stuck on
    // "Signing in…" while the destination RSC streams. window.location
    // gives the browser its native progress bar and a guaranteed unmount.
    setLoading('redirecting')
    window.location.href = next
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-vellum px-6">
      <div className="w-full max-w-sm flex flex-col gap-7">
        <div className="text-center">
          <Link href="/" className="font-serif text-3xl text-ink lowercase tracking-[-0.02em]">
            tyr
          </Link>
          <p className="text-sm text-driftwood mt-2">Sign in</p>
        </div>

        {otpExpired && (
          <div className="rounded-lg border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
            <p className="font-medium mb-1">Confirmation link expired</p>
            <p className="text-xs text-clay/80">
              Email confirmation links expire after 1 hour.{' '}
              <Link href="/signup" className="underline">
                Sign up again
              </Link>{' '}
              to receive a fresh link, or sign in if your account is already confirmed.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-bone bg-paper px-4 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            className="rounded-lg border border-bone bg-paper px-4 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20"
          />
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}

        <button
          onClick={login}
          disabled={loading !== null}
          className="rounded-full bg-ink py-2.5 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
        >
          {loading === 'redirecting' ? 'Redirecting…' : loading === 'signing' ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="flex flex-col gap-2 text-sm text-driftwood text-center">
          <p>
            <Link href="/forgot-password" className="text-ink underline">
              Forgot password?
            </Link>
          </p>
          <p>
            No account?{' '}
            <Link href="/signup" className="text-ink underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
