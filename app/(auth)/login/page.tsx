'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') ?? '/upload'

  async function login() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(next)
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
          <p className="text-sm text-driftwood mt-2">Sign in</p>
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
          disabled={loading}
          className="rounded-full bg-ink py-2.5 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-sm text-driftwood text-center">
          No account?{' '}
          <Link href="/signup" className="text-ink underline">
            Sign up
          </Link>
        </p>
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
