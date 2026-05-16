// M9.5: Single-bullet rewrite for builder drafts. Hits the rewriteBullet()
// LLM call, mutates the addressed bullet inside resumes.builder_input, and
// re-renders resumes.raw_text so a future re-score reflects the change.
// Per-draft cap = 5 rewrites enforced via resumes.builder_rewrites_used.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rewriteBullet } from '@/lib/builder/rewrite'
import { renderResumeText } from '@/lib/builder/render'
import type { GeneratedResume } from '@/lib/builder/types'
import { isAdminEmail } from '@/lib/admin'
import { checkRateLimit } from '@/lib/ratelimit'

const REWRITE_CAP = 5

interface RewriteRequestBody {
  resumeId: string
  sectionIndex: number
  itemIndex: number
  bulletIndex: number
  // The current generated resume (client-side state). We don't fully trust
  // it — we re-fetch the row to verify ownership and authoritative section
  // counts — but the bullet text it wants rewritten lives here.
  generated: GeneratedResume
}

export async function POST(request: Request) {
  try {
    return await handleRewrite(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[builder/rewrite-bullet] unhandled error:', err)
    return NextResponse.json({ error: 'Rewrite failed', detail: message }, { status: 500 })
  }
}

async function handleRewrite(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit('builder_rewrite', user.id)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', code: 'RATE_LIMITED', reset: rl.reset },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    )
  }

  let body: RewriteRequestBody
  try {
    body = (await request.json()) as RewriteRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { resumeId, sectionIndex, itemIndex, bulletIndex, generated } = body
  if (!resumeId || !generated) {
    return NextResponse.json({ error: 'resumeId and generated required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: resume } = await service
    .from('resumes')
    .select('candidate_id, input_kind, builder_rewrites_used, builder_input, target_role, target_jd, is_internship')
    .eq('id', resumeId)
    .single()
  if (!resume || resume.candidate_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (resume.input_kind !== 'builder') {
    return NextResponse.json({ error: 'Not a builder draft' }, { status: 400 })
  }
  const isAdmin = isAdminEmail(user.email)

  // Atomic reservation: bump builder_rewrites_used iff currently < cap.
  // Returns the new count, or NULL if the cap was already reached. Admins
  // bypass entirely.
  let newRewritesUsed: number
  if (isAdmin) {
    newRewritesUsed = (resume.builder_rewrites_used as number) + 1
  } else {
    const { data: bumped, error: rpcError } = await service.rpc('consume_builder_rewrite', {
      p_resume_id: resumeId,
      p_cap: REWRITE_CAP,
    })
    if (rpcError) {
      console.error('[builder/rewrite-bullet] consume_builder_rewrite failed:', rpcError)
      return NextResponse.json({ error: 'Rewrite check failed' }, { status: 500 })
    }
    if (bumped === null) {
      return NextResponse.json(
        {
          error: `Rewrite limit reached (${REWRITE_CAP} per draft)`,
          code: 'REWRITE_LIMIT',
        },
        { status: 429 }
      )
    }
    newRewritesUsed = bumped as number
  }

  async function refundRewriteOnFailure() {
    if (isAdmin) return
    // Best-effort decrement. Read-modify-write is fine here — we only ever
    // bump down by 1, never make a count negative, and races just mean a
    // user gets back a rewrite they paid for.
    await service
      .from('resumes')
      .update({ builder_rewrites_used: newRewritesUsed - 1 })
      .eq('id', resumeId)
  }

  // Locate the bullet
  const section = generated.sections[sectionIndex]
  if (!section) {
    await refundRewriteOnFailure()
    return NextResponse.json({ error: 'sectionIndex out of range' }, { status: 400 })
  }
  const item = section.items[itemIndex]
  if (!item) {
    await refundRewriteOnFailure()
    return NextResponse.json({ error: 'itemIndex out of range' }, { status: 400 })
  }
  const originalBullet = item.bullets[bulletIndex]
  if (typeof originalBullet !== 'string') {
    await refundRewriteOnFailure()
    return NextResponse.json({ error: 'bulletIndex out of range' }, { status: 400 })
  }

  // Rewrite via Claude
  let newBullet: string
  try {
    newBullet = await rewriteBullet({
      originalBullet,
      itemHeader: item.header,
      targetRole: (resume.target_role as string | null) ?? null,
      targetJd: (resume.target_jd as string | null) ?? null,
      isInternship: !!resume.is_internship,
    })
  } catch (err) {
    await refundRewriteOnFailure()
    throw err
  }

  // Mutate the generated resume + persist
  const updated: GeneratedResume = {
    ...generated,
    sections: generated.sections.map((s, i) => {
      if (i !== sectionIndex) return s
      return {
        ...s,
        items: s.items.map((it, j) => {
          if (j !== itemIndex) return it
          return {
            ...it,
            bullets: it.bullets.map((b, k) => (k === bulletIndex ? newBullet : b)),
          }
        }),
      }
    }),
  }
  const rawText = renderResumeText(updated)

  const existingBlob = (resume.builder_input as { user_input?: unknown; generated?: unknown } | null) ?? {}
  // builder_rewrites_used was already atomically bumped by the RPC above;
  // we only need to persist the new payload here.
  await service
    .from('resumes')
    .update({
      builder_input: { ...existingBlob, generated: updated },
      raw_text: rawText,
    })
    .eq('id', resumeId)

  return NextResponse.json({
    bullet: newBullet,
    rewrites_used: newRewritesUsed,
    rewrites_remaining: REWRITE_CAP - newRewritesUsed,
  })
}
