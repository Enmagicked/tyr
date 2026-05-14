// M9.5: Builder endpoint. Generates a resume from structured form input and
// stores it as a `resumes` row with input_kind='builder'. The caller then
// POSTs to /api/analyze with the returned resumeId to score it.
//
// Credit gate: requires credits_remaining >= 1 AND credits_purchased >= 1
// (the signup free credit is analyzer-only; builder access requires having
// purchased credits at least once).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPostHogClient } from '@/lib/posthog-server'
import { generateResume } from '@/lib/builder/generate'
import { renderResumeText } from '@/lib/builder/render'
import type { BuilderInput } from '@/lib/builder/types'
import { isAdminEmail } from '@/lib/admin'
import { loadBuilderSourceContext, buildInsightsAddendum } from '@/lib/builder/source-context'

export async function POST(request: Request) {
  try {
    return await handleBuilder(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[builder] unhandled error:', err)
    return NextResponse.json(
      { error: 'Builder handler failed', detail: message },
      { status: 500 }
    )
  }
}

interface BuilderRequestBody {
  input: BuilderInput
  target_role: string
  target_company?: string
  target_jd?: string
  is_internship?: boolean
  // M9.5: when the user clicks "Rebuild" from a report page, this carries
  // the source resume's id so generation can be conditioned on the
  // analyzer's findings (missing_signal + top_strengths consensus).
  source_resume_id?: string
}

async function handleBuilder(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Credit gate: builder requires both credits_remaining AND a prior purchase.
  // The free signup credit is analyzer-only. Admin emails skip both checks.
  const { data: candidate } = await service
    .from('candidates')
    .select('credits_remaining, credits_purchased')
    .eq('id', user.id)
    .single()

  const isAdmin = isAdminEmail(user.email)

  if (!isAdmin) {
    if (!candidate || (candidate.credits_remaining as number) <= 0) {
      return NextResponse.json(
        { error: 'No credits remaining', code: 'QUOTA_EXCEEDED' },
        { status: 402 }
      )
    }
    if ((candidate.credits_purchased as number) <= 0) {
      return NextResponse.json(
        {
          error: 'The builder requires purchased credits',
          code: 'BUILDER_LOCKED',
          hint: 'Your signup free credit is for the analyzer only. Purchase a credit pack to unlock the builder.',
        },
        { status: 402 }
      )
    }
  }

  let body: BuilderRequestBody
  try {
    body = (await request.json()) as BuilderRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.input || typeof body.input !== 'object') {
    return NextResponse.json({ error: 'input is required' }, { status: 400 })
  }
  if (!body.input.contact?.name || !body.input.contact?.email) {
    return NextResponse.json(
      { error: 'contact.name and contact.email are required' },
      { status: 400 }
    )
  }
  const targetRole = (body.target_role ?? '').trim()
  if (targetRole.length < 2 || targetRole.length > 80) {
    return NextResponse.json(
      { error: 'target_role must be 2-80 characters' },
      { status: 400 }
    )
  }
  const targetCompany = (body.target_company ?? '').trim()
  const targetJd = (body.target_jd ?? '').trim()
  if (targetJd.length > 10_000) {
    return NextResponse.json(
      { error: 'target_jd must be under 10,000 characters' },
      { status: 400 }
    )
  }
  const isInternship = !!body.is_internship

  // Optional: condition generation on insights from a prior resume scan.
  let insightsAddendum = ''
  if (body.source_resume_id) {
    const source = await loadBuilderSourceContext(body.source_resume_id, user.id)
    insightsAddendum = buildInsightsAddendum(source)
  }

  // Generate via Claude
  const generated = await generateResume(
    {
      input: body.input,
      targetRole,
      targetCompany: targetCompany || null,
      targetJd: targetJd || null,
      isInternship,
    },
    insightsAddendum
  )

  const rawText = renderResumeText(generated)

  // Store as a 'resumes' row. No file in storage — input_kind='builder'
  // means there's no upload artifact, the raw_text + builder_input are
  // the canonical source.
  const fileName = `${(generated.name || 'resume').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)}.builder.txt`
  const filePath = `${user.id}/${Date.now()}_${fileName}`

  const { error: storageError } = await service.storage
    .from('resumes')
    .upload(filePath, Buffer.from(rawText, 'utf8'), {
      contentType: 'text/plain; charset=utf-8',
      upsert: false,
    })
  if (storageError) {
    console.error('[builder] storage error:', storageError)
    return NextResponse.json({ error: 'Failed to store generated resume' }, { status: 500 })
  }

  const { data: resume, error: dbError } = await service
    .from('resumes')
    .insert({
      candidate_id: user.id,
      file_path: filePath,
      file_name: fileName,
      raw_text: rawText,
      target_role: targetRole,
      target_company: targetCompany,
      target_jd: targetJd || null,
      input_kind: 'builder',
      is_priority: true,
      is_internship: isInternship,
      builder_input: { user_input: body.input, generated },
    })
    .select()
    .single()
  if (dbError || !resume) {
    console.error('[builder] db error:', dbError)
    return NextResponse.json({ error: 'Failed to save generated resume' }, { status: 500 })
  }

  if (!isAdmin && candidate) {
    await service
      .from('candidates')
      .update({
        credits_remaining: (candidate.credits_remaining as number) - 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
  }

  const posthog = getPostHogClient()
  posthog.capture({
    distinctId: user.id,
    event: 'builder_resume_generated',
    properties: {
      resume_id: resume.id,
      target_role: targetRole,
      has_target_jd: targetJd.length > 0,
      is_internship: isInternship,
      experience_count: body.input.experiences.length,
      project_count: body.input.projects.length,
    },
  })
  await posthog.shutdown()

  return NextResponse.json({
    resumeId: resume.id,
    generated,
  })
}
