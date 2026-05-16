// Per-user rate limits for expensive API endpoints.
//
// Backed by Upstash Redis (same instance as the LLM cache). Fail-open: if
// Upstash credentials are missing or the call errors, the request proceeds
// — we'd rather serve traffic than 500 on a Redis blip.
//
// Budgets are conservative enough to allow normal interactive use while
// killing the obvious abuse path: a script hitting /api/analyze 1000x to
// burn through the 32-call LLM fan-out for free.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

let _redis: Redis | null | undefined
function redis(): Redis | null {
  if (_redis !== undefined) return _redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    _redis = null
    return null
  }
  _redis = new Redis({ url, token })
  return _redis
}

const limiters: Record<string, Ratelimit | null> = {}

function limiter(prefix: string, max: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`) {
  if (limiters[prefix] !== undefined) return limiters[prefix]
  const r = redis()
  if (!r) {
    limiters[prefix] = null
    return null
  }
  const l = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(max, window),
    analytics: false,
    prefix,
  })
  limiters[prefix] = l
  return l
}

export type LimitKind =
  | 'analyze'        // analysis graph kicks — 10/min
  | 'upload'         // PDF/URL/image ingest — 10/min
  | 'builder'        // builder generation — 5/min
  | 'builder_rewrite' // per-bullet rewrites — 30/min (cap is per-draft, this is per-user)
  | 'builder_prefill' // Haiku extraction — 5/min
  | 'checkout'       // Stripe session creation — 10/hour

const BUDGETS: Record<LimitKind, { max: number; window: `${number} ${'s' | 'm' | 'h' | 'd'}` }> = {
  analyze: { max: 10, window: '1 m' },
  upload: { max: 10, window: '1 m' },
  builder: { max: 5, window: '1 m' },
  builder_rewrite: { max: 30, window: '1 m' },
  builder_prefill: { max: 5, window: '1 m' },
  checkout: { max: 10, window: '1 h' },
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  reset: number  // ms epoch when budget refills
  limit: number
}

// Check + consume one token. Returns ok=true if under budget, ok=false if
// exceeded. On any Upstash failure, returns ok=true (fail-open).
export async function checkRateLimit(kind: LimitKind, userId: string): Promise<RateLimitResult> {
  const budget = BUDGETS[kind]
  const l = limiter(`rl:${kind}`, budget.max, budget.window)
  if (!l) {
    return { ok: true, remaining: budget.max, reset: Date.now() + 60_000, limit: budget.max }
  }
  try {
    const r = await l.limit(userId)
    return { ok: r.success, remaining: r.remaining, reset: r.reset, limit: r.limit }
  } catch (err) {
    console.error(`[ratelimit] ${kind} check failed (fail-open):`, err)
    return { ok: true, remaining: budget.max, reset: Date.now() + 60_000, limit: budget.max }
  }
}
