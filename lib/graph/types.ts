export type Context = Record<string, unknown>

export interface GraphNode {
  name: string
  fn: (ctx: Context) => Promise<unknown>
  depends_on?: string[]
  optional_deps?: string[]
}

export type EventType =
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'node_skipped'
  | 'graph_completed'

export interface GraphEvent {
  type: EventType
  run_id: string
  node?: string
  data?: unknown
  timestamp: number
}
