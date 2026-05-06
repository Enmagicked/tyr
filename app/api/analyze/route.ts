import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { execute } from '@/lib/graph'
import { broker } from '@/lib/event-broker'
import { buildAnalysisGraph } from '@/lib/agents'
import { randomUUID } from 'crypto'

export async function POST(request: Request) {
  try {
    return await handleAnalyze(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analyze] unhandled error:', err)
    return NextResponse.json(
      { error: 'Analyze handler failed', detail: message },
      { status: 500 }
    )
  }
}

async function handleAnalyze(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { resumeId?: string }
  if (!body.resumeId) {
    return NextResponse.json({ error: 'resumeId required' }, { status: 400 })
  }

  const runId = randomUUID()
  const nodes = buildAnalysisGraph()

  // Spawn graph as a background task — this returns immediately.
  // broker.track() holds a strong Node.js reference so the task isn't GC'd mid-run.
  const task = execute(
    nodes,
    { resume_id: body.resumeId },
    (event) => broker.emit(runId, event),
    runId
  ).catch((err) => {
    console.error(`[analyze] unhandled graph error for run ${runId}:`, err)
    broker.emit(runId, {
      type: 'graph_completed',
      run_id: runId,
      data: { error: String(err) },
      timestamp: Date.now(),
    })
  })

  broker.track(runId, task)

  return NextResponse.json({ runId })
}
