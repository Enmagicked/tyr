// Math helpers for the M4 landing animations. Pure functions, deterministic,
// no DOM dependencies — safe to import from server components if needed.

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Ease in-out (quadratic). Mirrors the design's `eio` helper.
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

// Eased 1-D ramp: maps `v` from [a,b] to [c,d] through easeInOut, clamped.
// Matches the design's `ease(v,a,b,c,d)`. Used for scroll progress curves.
export function ease(v: number, a: number, b: number, c: number, d: number): number {
  const t = clamp((v - a) / (b - a || 1), 0, 1)
  return c + (d - c) * easeInOut(t)
}

// Ease-out cubic — feels "deceleration" on count-up animations.
export function easeOutCubic(t: number): number {
  const c = clamp(t, 0, 1)
  return 1 - Math.pow(1 - c, 3)
}
