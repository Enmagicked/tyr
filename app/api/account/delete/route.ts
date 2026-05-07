// M5 destructive endpoint. Deletes EVERYTHING tied to the authenticated
// user: storage objects, DB rows (cascade through FK), candidates, auth.users.
//
// Steps run in this order so a partial failure leaves the system in a
// recoverable state:
//   1. List + delete storage objects under <user_id>/* (Supabase storage
//      doesn't cascade with DB).
//   2. Delete from `resumes` — FKs cascade to parse_results, parse_disagreement,
//      perception_reports, perception_query_responses, llm_responses.
//   3. Delete from `candidates` (FK to auth.users with `on delete cascade`,
//      so deleting auth.users would also do this — but explicit is clearer).
//   4. Delete from auth.users via admin API.
//
// Each step wraps in try/catch and the response reports which steps
// succeeded — the user knows whether they're done or need to retry.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

interface StepResult {
  step: string
  ok: boolean
  detail?: string
}

export async function POST() {
  try {
    return await handleDelete()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[account/delete] unhandled error:', err)
    return NextResponse.json(
      { error: 'Delete handler failed', detail: message },
      { status: 500 }
    )
  }
}

async function handleDelete() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const userId = user.id
  const steps: StepResult[] = []

  // 1. Storage objects under <user_id>/
  try {
    const { data: objects, error: listErr } = await service.storage
      .from('resumes')
      .list(userId, { limit: 1000 })
    if (listErr) throw listErr
    const paths = (objects ?? []).map((o) => `${userId}/${o.name}`)
    if (paths.length > 0) {
      const { error: rmErr } = await service.storage.from('resumes').remove(paths)
      if (rmErr) throw rmErr
    }
    steps.push({ step: 'storage_objects', ok: true, detail: `${paths.length} objects removed` })
  } catch (err) {
    steps.push({
      step: 'storage_objects',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 2. Delete from resumes (cascades to all dependent tables via FK).
  try {
    const { error } = await service.from('resumes').delete().eq('candidate_id', userId)
    if (error) throw error
    steps.push({ step: 'resumes_cascade', ok: true })
  } catch (err) {
    steps.push({
      step: 'resumes_cascade',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 3. Delete candidates row explicitly (will also cascade from auth.users
  //    delete in step 4, but doing it here lets the user know whether the
  //    profile rows are gone before we hit the auth admin API).
  try {
    const { error } = await service.from('candidates').delete().eq('id', userId)
    if (error) throw error
    steps.push({ step: 'candidates', ok: true })
  } catch (err) {
    steps.push({
      step: 'candidates',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 4. Delete auth user via admin API.
  try {
    const { error } = await service.auth.admin.deleteUser(userId)
    if (error) throw error
    steps.push({ step: 'auth_user', ok: true })
  } catch (err) {
    steps.push({
      step: 'auth_user',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  const allOk = steps.every((s) => s.ok)
  return NextResponse.json(
    {
      ok: allOk,
      user_id: userId,
      steps,
    },
    { status: allOk ? 200 : 207 }   // 207 Multi-Status for partial success
  )
}
