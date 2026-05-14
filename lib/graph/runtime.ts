import { Context, GraphNode, GraphEvent } from './types'

type RunResult = { name: string; result?: unknown; error?: Error }

// Stateless graph executor. Every piece of state lives in ctx and results —
// both local to one execute() call. Nothing escapes. This is what makes the
// worker-fleet pattern work: one process or fifty, zero code changes.
export async function execute(
  nodes: GraphNode[],
  initialContext: Context,
  emit: (event: GraphEvent) => void,
  runId: string
): Promise<Context> {
  const ctx: Context = { ...initialContext }
  const completed = new Map<string, unknown>()
  const failed = new Set<string>()
  const unstarted = new Set(nodes.map((n) => n.name))
  const nodeMap = new Map(nodes.map((n) => [n.name, n]))
  const running = new Map<string, Promise<RunResult>>()

  function hardDepFailed(node: GraphNode): boolean {
    return (node.depends_on ?? []).some((d) => failed.has(d))
  }

  function canRun(node: GraphNode): boolean {
    if (hardDepFailed(node)) return false
    const hardDepsOk = (node.depends_on ?? []).every((d) => completed.has(d))
    const softDepsDone = (node.optional_deps ?? []).every(
      (d) => completed.has(d) || failed.has(d)
    )
    return hardDepsOk && softDepsDone
  }

  function startNode(node: GraphNode) {
    unstarted.delete(node.name)
    emit({ type: 'node_started', run_id: runId, node: node.name, timestamp: Date.now() })

    const p: Promise<RunResult> = node
      .fn(ctx)
      .then((result) => ({ name: node.name, result }))
      .catch((error) => ({
        name: node.name,
        error: error instanceof Error ? error : new Error(String(error)),
      }))

    running.set(node.name, p)
  }

  // Kick off nodes with no dependencies
  for (const name of [...unstarted]) {
    const node = nodeMap.get(name)!
    if (canRun(node)) startNode(node)
  }

  while (running.size > 0) {
    // Promise.race = asyncio.wait(FIRST_COMPLETED): get the next finished node,
    // leave all others running. The Map ensures we never double-start a node.
    const { name, result, error } = await Promise.race(running.values())
    running.delete(name)

    if (error) {
      failed.add(name)
      // Surface to Vercel logs / Sentry — without this, node-level throws
      // (missing env vars, provider 4xx, etc.) only appear on the SSE
      // stream to the client and vanish.
      console.error(`[graph] node_failed ${name}: ${error.message}${error.stack ? ' | stack: ' + error.stack.split('\n').slice(0, 4).join(' | ') : ''}`)
      emit({
        type: 'node_failed',
        run_id: runId,
        node: name,
        data: { error: error.message },
        timestamp: Date.now(),
      })
    } else {
      completed.set(name, result)
      ctx[name] = result
      emit({
        type: 'node_completed',
        run_id: runId,
        node: name,
        data: result,
        timestamp: Date.now(),
      })
    }

    // Skip nodes whose hard deps just failed — mark them immediately so
    // their own optional-dep consumers can continue.
    for (const nodeName of [...unstarted]) {
      const node = nodeMap.get(nodeName)!
      if (hardDepFailed(node)) {
        unstarted.delete(nodeName)
        failed.add(nodeName)
        emit({
          type: 'node_skipped',
          run_id: runId,
          node: nodeName,
          data: { reason: 'Hard dependency failed' },
          timestamp: Date.now(),
        })
      }
    }

    // Start any nodes that are now runnable
    for (const nodeName of [...unstarted]) {
      const node = nodeMap.get(nodeName)!
      if (canRun(node)) startNode(node)
    }
  }

  // Anything still in unstarted is permanently blocked (deadlock or all deps failed)
  for (const nodeName of [...unstarted]) {
    failed.add(nodeName)
    emit({
      type: 'node_skipped',
      run_id: runId,
      node: nodeName,
      data: { reason: 'Node never became runnable' },
      timestamp: Date.now(),
    })
  }

  emit({
    type: 'graph_completed',
    run_id: runId,
    data: {
      completed: [...completed.keys()],
      failed: [...failed],
      total: nodes.length,
    },
    timestamp: Date.now(),
  })

  return ctx
}
