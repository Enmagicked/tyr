// Per-bullet heuristic metrics. Pure functions, no DOM/network. Used by:
//   - lib/agents/analyze-bullets.ts (graph node)
//   - the synthesize_summary prompt context (so Claude can cite real numbers)
//
// All three feature detectors (quantification, action verbs, buzzwords) are
// soft signals — judgment calls. Document the lists at the top so the user
// can audit + adjust without spelunking the implementation.

// ---------------------------------------------------------------------------
// Action verb list — strong, outcome-oriented openers recruiters look for.
// Source: cross-referenced against the standard lists used at Career Cup,
// Harvard OCS, and Stanford SLAC. Lowercase form; matched at the start of
// the trimmed bullet, case-insensitively.
// ---------------------------------------------------------------------------
export const ACTION_VERBS: readonly string[] = [
  // build / create
  'built', 'created', 'designed', 'developed', 'engineered', 'architected',
  'authored', 'implemented', 'coded', 'prototyped', 'launched', 'shipped',
  'delivered', 'deployed', 'released', 'rolled out',
  // lead / manage
  'led', 'managed', 'directed', 'oversaw', 'spearheaded', 'pioneered',
  'mentored', 'coached', 'trained', 'guided', 'coordinated',
  // grow / improve
  'grew', 'increased', 'scaled', 'accelerated', 'expanded', 'doubled',
  'tripled', 'improved', 'optimized', 'enhanced', 'strengthened', 'streamlined',
  // reduce / save
  'reduced', 'cut', 'decreased', 'eliminated', 'saved', 'minimized', 'lowered',
  // analyze / decide
  'analyzed', 'evaluated', 'assessed', 'researched', 'investigated',
  'identified', 'diagnosed', 'measured', 'modeled', 'forecasted',
  // ship / present
  'presented', 'pitched', 'wrote', 'published', 'documented', 'communicated',
  'briefed', 'demoed',
  // collaborate
  'partnered', 'collaborated', 'negotiated', 'closed', 'won', 'secured',
  // technical
  'migrated', 'refactored', 'integrated', 'automated', 'orchestrated',
  'configured', 'instrumented', 'debugged', 'resolved',
] as const

// ---------------------------------------------------------------------------
// Buzzword / vague-phrase list — phrases that signal padding, not signal.
// Soft signal: the LLM summary is told the count but not asked to act on it
// directly. Treat low signal-to-noise; the value is in flagging clusters.
// ---------------------------------------------------------------------------
export const BUZZWORDS: readonly string[] = [
  'team player',
  'results-driven',
  'results-oriented',
  'goal-oriented',
  'detail-oriented',
  'detail oriented',
  'self-starter',
  'self starter',
  'go-getter',
  'hard worker',
  'hard-working',
  'fast-paced',
  'fast paced',
  'value add',
  'value-add',
  'synergy',
  'synergies',
  'synergize',
  'leverage',
  'leveraging',
  'thought leader',
  'thought-leader',
  'innovative thinker',
  'out-of-the-box',
  'out of the box',
  'paradigm shift',
  'circle back',
  'low-hanging fruit',
  'move the needle',
  'best of breed',
  'best-in-class',
  'world-class',
  'cutting edge',
  'cutting-edge',
  'bleeding edge',
  'mission-critical',
  'mission critical',
  'cross-functional',
  'cross functional',
  'rockstar',
  'ninja',
  'guru',
  'wizard',
  'passionate',
  'dynamic',
  'proactive',
] as const

// ---------------------------------------------------------------------------
// Quantification regex set — bullet contains a number in a context that
// reads as a measured outcome. Each regex matches one common form.
// ---------------------------------------------------------------------------
const QUANTIFICATION_PATTERNS: readonly RegExp[] = [
  /\d+\s*%/,                               // "47%", "47 %"
  /\$\s*\d/,                               // "$1.2M", "$ 5"
  /\b\d+\s*x\b/i,                          // "3x", "10x"
  /\bby\s+\d/i,                            // "by 47", "by 2 weeks"
  /(increased|reduced|improved|grew|cut|saved|drove|delivered|generated)\s+\S{0,20}\d/i,
  /\b\d+(\.\d+)?\s*(million|billion|thousand|m|b|k|mm)\b/i,  // "5M", "2.3 billion"
  /\b\d{2,}\b/,                            // any standalone 2+ digit number ("100 users")
] as const

export interface BulletMetrics {
  quantification: number
  action_verb: number
  buzzword: number
  char_stats: { min: number; max: number; mean: number; p50: number }
}

// ---------------------------------------------------------------------------
// Per-feature counters — exported individually so analyze_bullets can use
// them and the unit tests can verify each in isolation.
// ---------------------------------------------------------------------------

export function hasQuantification(bullet: string): boolean {
  if (!bullet) return false
  return QUANTIFICATION_PATTERNS.some((re) => re.test(bullet))
}

export function startsWithActionVerb(bullet: string): boolean {
  if (!bullet) return false
  const trimmed = bullet.trim().toLowerCase()
  if (!trimmed) return false
  // Strip leading bullet glyphs / numbering that splitBullets may have
  // left in (defensive — splitBullets normally removes them).
  const cleaned = trimmed.replace(/^[•·\-*\d.)\s]+/, '')
  return ACTION_VERBS.some((verb) => {
    if (cleaned === verb) return true
    return cleaned.startsWith(verb + ' ') || cleaned.startsWith(verb + ',')
  })
}

export function buzzwordCount(bullet: string): number {
  if (!bullet) return 0
  const lower = bullet.toLowerCase()
  let count = 0
  for (const phrase of BUZZWORDS) {
    if (lower.includes(phrase)) count += 1
  }
  return count
}

export function charLengthStats(
  bullets: readonly string[]
): { min: number; max: number; mean: number; p50: number } {
  if (bullets.length === 0) return { min: 0, max: 0, mean: 0, p50: 0 }
  const lengths = bullets.map((b) => b.length).sort((a, b) => a - b)
  const sum = lengths.reduce((s, n) => s + n, 0)
  const mid = Math.floor(lengths.length / 2)
  const p50 =
    lengths.length % 2 === 1 ? lengths[mid] : (lengths[mid - 1] + lengths[mid]) / 2
  return {
    min: lengths[0],
    max: lengths[lengths.length - 1],
    mean: sum / lengths.length,
    p50,
  }
}

// ---------------------------------------------------------------------------
// Top-level aggregator
// ---------------------------------------------------------------------------

export function bulletMetrics(bullets: readonly string[]): BulletMetrics {
  const nonEmpty = bullets.filter((b) => b && b.trim().length > 0)
  let quant = 0
  let action = 0
  let buzz = 0
  for (const b of nonEmpty) {
    if (hasQuantification(b)) quant += 1
    if (startsWithActionVerb(b)) action += 1
    buzz += buzzwordCount(b)
  }
  return {
    quantification: quant,
    action_verb: action,
    buzzword: buzz,
    char_stats: charLengthStats(nonEmpty),
  }
}
