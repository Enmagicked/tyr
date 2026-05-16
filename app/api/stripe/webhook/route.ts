import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { getPostHogClient } from '@/lib/posthog-server'

// Raw body required for Stripe webhook signature verification.
export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing stripe-signature or webhook secret' }, { status: 400 })
  }

  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe/webhook] signature verification failed:', message)
    return NextResponse.json({ error: `Webhook signature invalid: ${message}` }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true, ignored: event.type })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const userId = session.metadata?.user_id
  const creditCount = Number(session.metadata?.credit_count ?? 0)
  const amountTotal = session.amount_total ?? 0
  const tier = session.metadata?.tier ?? null

  if (!userId || creditCount <= 0) {
    console.error('[stripe/webhook] missing user_id or credit_count in metadata', session.metadata)
    return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
  }

  const service = createServiceClient()

  // Idempotency. Stripe retries webhooks with the same event.id on any
  // non-2xx response or network blip — without this dedupe, retries would
  // double-credit the user. Insert first; on conflict, the event is already
  // processed → 200 OK so Stripe stops retrying.
  const { error: insertError } = await service
    .from('processed_stripe_events')
    .insert({ event_id: event.id })

  if (insertError) {
    // Postgres unique-violation code = 23505. Anything else is a real DB
    // failure → 500 so Stripe retries.
    if (insertError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error('[stripe/webhook] could not record event:', insertError)
    return NextResponse.json({ error: 'DB write failed' }, { status: 500 })
  }

  // Atomic increment via RPC — single SQL statement, no read-modify-write race.
  const { error: rpcError } = await service.rpc('apply_credit_purchase', {
    p_user_id: userId,
    p_count: creditCount,
  })

  if (rpcError) {
    console.error('[stripe/webhook] apply_credit_purchase failed:', rpcError)
    // Best-effort rollback of the dedupe row so a Stripe retry has a chance
    // to re-fulfill. If this also fails we accept that the user may need
    // manual support — at least no double-credit risk.
    await service.from('processed_stripe_events').delete().eq('event_id', event.id)
    return NextResponse.json({ error: 'Credit grant failed' }, { status: 500 })
  }

  const posthog = getPostHogClient()
  posthog.capture({
    distinctId: userId,
    event: 'checkout_completed',
    properties: {
      credit_count: creditCount,
      amount_cents: amountTotal,
      stripe_session_id: session.id,
      tier,
    },
  })
  await posthog.shutdown()

  return NextResponse.json({ received: true })
}
