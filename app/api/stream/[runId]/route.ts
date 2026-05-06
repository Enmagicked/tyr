import { broker } from '@/lib/event-broker'

// Server-Sent Events endpoint. Clients POST to /api/analyze, get a runId,
// then open an EventSource here. No polling — the server pushes.
// History replay means reconnecting clients don't miss events.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      function send(data: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const unsubscribe = broker.subscribe(runId, (event) => {
        send(event)
        if (event.type === 'graph_completed') {
          controller.close()
          unsubscribe()
        }
      })

      // Clean up when the client disconnects
      request.signal.addEventListener('abort', () => {
        unsubscribe()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // prevent nginx from buffering the stream
    },
  })
}
