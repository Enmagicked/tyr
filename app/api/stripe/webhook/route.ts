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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.user_id
    const creditCount = Number(session.metadata?.credit_count ?? 0)
    const amountTotal = session.amount_total ?? 0

    if (!userId || creditCount <= 0) {
      console.error('[stripe/webhook] missing user_id or credit_count in metadata', session.metadata)
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const service = createServiceClient()

    // Read current values then write incremented values.
    // Stripe's idempotency key prevents double-processing on retries.
    const { data: candidate, error: fetchError } = await service
      .from('candidates')
      .select('credits_remaining, credits_purchased')
      .eq('id', userId)
      .single()

    if (fetchError || !candidate) {
      console.error('[stripe/webhook] could not fetch candidate:', fetchError)
      return NextResponse.json({ error: 'User not found' }, { status: 400 })
    }

    const { error: updateError } = await service
      .from('candidates')
      .update({
        credits_remaining: (candidate.credits_remaining as number) + creditCount,
        credits_purchased: (candidate.credits_purchased as number) + creditCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      console.error('[stripe/webhook] update failed:', updateError)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }

    const posthog = getPostHogClient()
    posthog.capture({
      distinctId: userId,
      event: 'checkout_completed',
      properties: {
        credit_count: creditCount,
        amount_cents: amountTotal,
        stripe_session_id: session.id,
      },
    })
    await posthog.shutdown()
  }

  return NextResponse.json({ received: true })
}
