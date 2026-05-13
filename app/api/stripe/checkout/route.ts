import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, CREDIT_PACKS, type CreditPackCredits } from '@/lib/stripe'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as { credits?: number }
    const credits = body.credits as CreditPackCredits | undefined
    const pack = CREDIT_PACKS.find((p) => p.credits === credits)
    if (!pack) {
      return NextResponse.json({ error: 'Invalid credit pack' }, { status: 400 })
    }

    const priceId = process.env[pack.priceEnvKey]
    if (!priceId) {
      console.error(`[stripe/checkout] Missing env var ${pack.priceEnvKey}`)
      return NextResponse.json({ error: 'Payment not configured' }, { status: 503 })
    }

    const origin = new URL(request.url).origin
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        user_id: user.id,
        credit_count: String(pack.credits),
      },
      success_url: `${origin}/upload?credits_added=${pack.credits}`,
      cancel_url: `${origin}/upload`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe/checkout] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
