import Stripe from 'stripe'

// Lazy singleton — avoids import-time key access during build/test.
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' as any })
  }
  return _stripe
}

// Credit packs available for purchase. Price IDs live in Vercel env vars.
//
// `firstPurchaseOnly: true` means the pack is only offered when the user
// has never bought before (candidates.credits_purchased = 0). The checkout
// route enforces this server-side; the UI hides the pack for repeat buyers.
export const CREDIT_PACKS = [
  {
    credits: 1,
    label: 'Intro · 1 decode',
    price: '$4',
    priceEnvKey: 'STRIPE_PRICE_INTRO',
    firstPurchaseOnly: true,
    tier: 'intro',
  },
  {
    credits: 1,
    label: '1 decode',
    price: '$6',
    priceEnvKey: 'STRIPE_PRICE_1_CREDIT',
    firstPurchaseOnly: false,
    tier: 'single',
  },
  {
    credits: 5,
    label: '5 decodes',
    price: '$15',
    priceEnvKey: 'STRIPE_PRICE_5_CREDITS',
    firstPurchaseOnly: false,
    tier: 'bulk',
  },
] as const

export type CreditPackTier = (typeof CREDIT_PACKS)[number]['tier']

export function findPackByTier(tier: string): (typeof CREDIT_PACKS)[number] | undefined {
  return CREDIT_PACKS.find((p) => p.tier === tier)
}
