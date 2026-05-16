'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import posthog from 'posthog-js'

function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState<'creating' | 'redirecting' | null>(null)
  const [done, setDone] = useState(false)
  const search = useSearchParams()
  const next = search.get('next') ?? '/upload'

  async function signup() {
    setLoading('creating')
    setError('')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(null)
      return
    }
    if (data.user) {
      posthog.identify(data.user.id, { email: data.user.email })
      posthog.capture('user_signed_up', { email: data.user.email })
    }
    // When Supabase has email confirmation OFF, signUp returns a session
    // immediately — the user is already signed in. Skip the "check your
    // email" screen and route them straight into the app. When confirmation
    // is ON, data.session is null and we show the check-email message.
    if (data.session) {
      setLoading('redirecting')
      window.location.href = next
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-vellum px-6">
        <div className="w-full max-w-sm flex flex-col gap-4 text-center">
          <Link href="/" className="font-serif text-3xl text-ink lowercase tracking-[-0.02em]">
            tyr
          </Link>
          <h1 className="font-serif text-2xl text-ink">Check your email</h1>
          <p className="text-sm text-driftwood">
            We sent a confirmation link to <strong className="text-ink">{email}</strong>. Click it to activate your account.
          </p>
          <Link href="/login" className="text-sm text-ink underline">
            Back to sign in
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-vellum px-6">
      <div className="w-full max-w-sm flex flex-col gap-7">
        <div className="text-center">
          <Link href="/" className="font-serif text-3xl text-ink lowercase tracking-[-0.02em]">
            tyr
          </Link>
          <p className="text-sm text-driftwood mt-2">Create account</p>
        </div>

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
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signup()}
            className="rounded-lg border border-bone bg-paper px-4 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20"
          />
        </div>

        {error && <p className="text-sm text-clay">{error}</p>}

        <button
          onClick={signup}
          disabled={loading !== null}
          className="rounded-full bg-ink py-2.5 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
        >
          {loading === 'redirecting' ? 'Redirecting…' : loading === 'creating' ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-sm text-driftwood text-center">
          Already have an account?{' '}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-ink underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}
