import { GraphEvent } from './graph/types'

type Handler = (event: GraphEvent) => void

// In-process pub/sub. Identical interface to Redis pub/sub — swap the
// implementation when scale demands it, agents and runtime never know.
class EventBroker {
  private handlers = new Map<string, Set<Handler>>()
  private history = new Map<string, GraphEvent[]>()
  // Strong refs prevent Node.js from GC-ing background tasks mid-run.
  private tasks = new Map<string, Promise<unknown>>()

  subscribe(runId: string, handler: Handler): () => void {
    if (!this.handlers.has(runId)) {
      this.handlers.set(runId, new Set())
    }
    this.handlers.get(runId)!.add(handler)

    // Replay history so late-joining SSE clients don't miss events
    for (const event of this.history.get(runId) ?? []) {
      handler(event)
    }

    return () => this.handlers.get(runId)?.delete(handler)
  }

  emit(runId: string, event: GraphEvent) {
    const events = this.history.get(runId) ?? []
    events.push(event)
    this.history.set(runId, events)
    this.handlers.get(runId)?.forEach((h) => h(event))
  }

  track(runId: string, task: Promise<unknown>) {
    this.tasks.set(runId, task)
    task.finally(() => {
      // Keep history for 2 minutes for reconnecting clients, then clean up
      setTimeout(() => {
        this.handlers.delete(runId)
        this.history.delete(runId)
        this.tasks.delete(runId)
      }, 120_000)
    })
  }

  getHistory(runId: string): GraphEvent[] {
    return this.history.get(runId) ?? []
  }
}

export const broker = new EventBroker()
