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

// Credit packs available for purchase.
// Price IDs are created in the Stripe Dashboard and stored in env vars.
export const CREDIT_PACKS = [
  {
    credits: 1,
    label: '1 decode',
    price: '$4',
    priceEnvKey: 'STRIPE_PRICE_1_CREDIT',
  },
  {
    credits: 5,
    label: '5 decodes',
    price: '$15',
    priceEnvKey: 'STRIPE_PRICE_5_CREDITS',
  },
] as const

export type CreditPackCredits = (typeof CREDIT_PACKS)[number]['credits']
