// M9.5: builder prefill endpoint. Called from BuilderFlow on mount when
// the URL has ?from=<resumeId>. Returns the full BuilderSourceContext
// including the Haiku-extracted BuilderInput so the client can populate
// the form without blocking the page render.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadBuilderSourceContext } from '@/lib/builder/source-context'

// Haiku extraction can run 1-3s; allow headroom for cold starts.
export const maxDuration = 30

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
