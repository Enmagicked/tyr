// M9.5: builder prefill endpoint. Called from BuilderFlow on mount when
// the URL has ?from=<resumeId>. Returns the full BuilderSourceContext
// including the Haiku-extracted BuilderInput so the client can populate
// the form without blocking the page render.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadBuilderSourceContext } from '@/lib/builder/source-context'
import { checkRateLimit } from '@/lib/ratelimit'

// Haiku extraction usually 1-3s, but cold starts + Anthropic queueing
// can spike to 20s+. Headroom for both, with an internal Haiku timeout
// that falls back to the canonical-data mapping if it goes too long.
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rl = await checkRateLimit('builder_prefill', user.id)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', code: 'RATE_LIMITED', reset: rl.reset },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      )
    }

    const url = new URL(request.url)
    const resumeId = url.searchParams.get('resumeId')
    if (!resumeId) {
      return NextResponse.json({ error: 'resumeId required' }, { status: 400 })
    }

    const ctx = await loadBuilderSourceContext(resumeId, user.id, { withExtraction: true })
    if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(ctx)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[builder/prefill] error:', err)
    return NextResponse.json({ error: 'Prefill failed', detail: message }, { status: 500 })
  }
}
