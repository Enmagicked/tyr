import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getStripe, findPackByTier } from '@/lib/stripe'
import { checkRateLimit } from '@/lib/ratelimit'

// Canonical site URL for success/cancel redirects. Avoids bouncing users
// back to a Vercel preview URL when checkout originates from a preview.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://usetyr.com'

const ALLOWED_RETURN_PATHS = new Set(['/upload', '/builder', '/account', '/reports'])

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rl = await checkRateLimit('checkout', user.id)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', code: 'RATE_LIMITED', reset: rl.reset },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      )
    }

    const body = (await request.json()) as { tier?: string; return_to?: string }
    const tier = typeof body.tier === 'string' ? body.tier : ''
    const pack = findPackByTier(tier)
    if (!pack) {
      return NextResponse.json({ error: 'Invalid credit pack' }, { status: 400 })
    }

    // First-purchase gate. The intro tier is reserved for users who have
    // never bought before. Repeat buyers go through the $6 / $15 packs.
    if (pack.firstPurchaseOnly) {
      const service = createServiceClient()
      const { data: candidate } = await service
        .from('candidates')
        .select('credits_purchased')
        .eq('id', user.id)
        .single()
      const purchased = (candidate?.credits_purchased as number | undefined) ?? 0
      if (purchased > 0) {
        return NextResponse.json(
          { error: 'Intro pack is for first purchases only' },
          { status: 400 }
        )
      }
    }

    const priceId = process.env[pack.priceEnvKey]
    if (!priceId) {
      console.error(`[stripe/checkout] Missing env var ${pack.priceEnvKey}`)
      return NextResponse.json({ error: 'Payment not configured' }, { status: 503 })
    }

    const returnTo = ALLOWED_RETURN_PATHS.has(body.return_to ?? '')
      ? body.return_to!
      : '/upload'

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        user_id: user.id,
        credit_count: String(pack.credits),
        tier: pack.tier,
      },
      success_url: `${SITE_URL}${returnTo}?credits_added=${pack.credits}`,
      cancel_url: `${SITE_URL}${returnTo}`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[stripe/checkout] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
