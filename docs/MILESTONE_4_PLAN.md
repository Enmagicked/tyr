# Milestone 4 — tyr brand, landing site, and report redesign

Pre-implementation plan. Translates the Claude-design handoff
(`D:/downloads/Tyr-handoff/tyr/project/Tyr Landing Page.html`) into the
Next.js 16 codebase, executes the brand rename, and redesigns
`/report/[resumeId]` against the same design language. Companion docs:
[MILESTONE_1_AUDIT.md](MILESTONE_1_AUDIT.md), [MILESTONE_2_PLAN.md](MILESTONE_2_PLAN.md),
[MILESTONE_3_PLAN.md](MILESTONE_3_PLAN.md), and the corresponding
verification docs.

## Why this milestone

M2 built the parser disagreement substrate. M3 built the LLM
disagreement substrate. Both write to Supabase and surface as
unstyled rows on a functional-but-bare report page. M4 is the
**user-facing layer** — the thing that turns a working pipeline into
a product anyone would land on, sign up for, and come back to.

Per the prior conversation: M5 = outcome schema, which is gated on
having actual users to collect outcomes from. M4 ships the funnel
that brings them in.

## Brand decision

Wordmark is **`tyr`** — all lowercase — across nav logo, page title,
package metadata, footer, and report-page header. In body copy where
it reads as a proper noun mid-sentence (e.g. "Tyr decodes both
reports"), keep capitalized. Examples:

- Logo / nav: `tyr`
- Page `<title>`: `tyr — see yourself the way AI sees you`
- Footer: `© 2026 tyr` + `Named after the Norse god of justice and fairness.`
- Sentence body: `Tyr runs four heterogeneous frontier LLMs…`

Project on disk stays `ai-hiring-decoder` (renaming a Git repo + npm
package is a follow-up out of scope here).

## Issues to resolve

| # | Issue | Target |
|---|---|---|
| W | Brand: every user-visible "AI Hiring Decoder" / "Resume Decoder" string must become `tyr` | `app/layout.tsx`, `app/page.tsx`, `app/(auth)/{login,signup}/page.tsx`, `package.json` (`name` stays, only `description` changes), `README.md`, all `<title>` and meta |
| X | Color system: design uses an 11-color palette (vellum, ink, driftwood, thistle, marigold, midnight, sage, clay, bone, dune, paper) — Tailwind config has none of these | `tailwind.config.ts` (or equivalent), `app/globals.css` |
| Y | Typography: design uses Instrument Serif + Inter via `<link>` tag — should be loaded via `next/font/google` for perf and self-hosting | `app/layout.tsx`, all components |
| Z | Routing: landing must live at `/` for everyone (logged-in or not); upload moves to `/upload` (auth-gated); report at `/report/[resumeId]` (auth-gated; redesigned) | `app/page.tsx`, `app/upload/page.tsx` (new), `app/report/[resumeId]/page.tsx` (rewrite), `proxy.ts` (gate `/upload` and `/report/*`) |
| AA | Landing site: 8 sections from the design (Nav, Hero, ScrollReveal, HowItWorks, ReportPreview, SampleInsights, FAQ, Footer) — none currently exist | `components/landing/*.tsx` (new) |
| AB | Hero video: `upscaled-video.mp4` is in the handoff bundle, not in `public/` | copy to `public/hero.mp4` |
| AC | Honest+technical copy: hero subhead and FAQ in the design contain factually wrong claims ("GPT-4o and Claude" undersells the 4-model stack; "never stored" contradicts the Supabase persistence layer; "Greenhouse, Workday, Lever" misrepresents which parsers we run) | new copy drafted in §"Copy rewrites" below |
| AD | Sample-judgment secondary CTA — deferred per user direction; hide button for v1 | `components/landing/hero.tsx` |
| AE | Target-role / target-company input — required by M3's q4 prompt; currently hardcoded; needs a form on `/upload` matching the design language | `components/upload/target-form.tsx` (new), `app/api/upload/route.ts`, `app/api/analyze/route.ts`, plumb through to `lib/agents/llm.ts` and the perception query suite |
| AF | Upload card on `/upload` is the M1 unstyled dropzone; needs design-language treatment | `components/upload/upload-form.tsx` (refactor from `components/resume-upload.tsx`) |
| AG | Report page is a JSON dump; needs a real visualization layer for M2 parser disagreement + M3 σ/ρ grid + AI-legibility score + inter-modal δ | `components/report/*.tsx` (new), `app/report/[resumeId]/page.tsx` (rewrite) |
| AH | Auth pages (`/login`, `/signup`) are also unstyled and break the design continuity | `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx` (light restyle to match palette/type) |

## Design system

### Color tokens (`tailwind.config.ts`)

```ts
extend: {
  colors: {
    vellum:    '#EFE9DB',  // page background, primary surface
    ink:       '#1E1812',  // primary text, dark CTA, footer bg
    driftwood: '#6E6358',  // secondary text, labels
    thistle:   '#846F9C',  // accent (selection highlight)
    marigold:  '#F0B85C',  // hero italic accent, step "2"
    midnight:  '#0F1830',  // hero video overlay, deep contrast
    sage:      '#7E967A',  // ATS report accent (positive structure)
    clay:      '#C58569',  // AI perception accent (interpretive)
    bone:      '#E5DFCF',  // dividers, muted borders
    dune:      '#FAF1EA',  // alternating section background
    paper:     '#FDFAF5',  // card background
    'lilac-smoke': '#F2EBF6', // tertiary tint
  },
  fontFamily: {
    serif: ['var(--font-instrument-serif)', 'Georgia', 'serif'],
    sans:  ['var(--font-inter)', '-apple-system', 'sans-serif'],
  },
  keyframes: {
    'fade-up': { from: { opacity: '0', transform: 'translateY(28px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
    'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
  },
  animation: {
    'fade-up': 'fade-up .9s ease both',
    'fade-in': 'fade-in .8s ease both',
  },
}
```

### Typography

`app/layout.tsx`:
```ts
import { Instrument_Serif, Inter } from 'next/font/google'

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
})
const sans = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
})

// <html className={`${serif.variable} ${sans.variable}`}>
```

Drop the Google Fonts `<link>` tag — `next/font` self-hosts and is faster.

### Type scale (matches design)

| Use | Family | Weight | Size | Tracking | Line-height |
|---|---|---|---|---|---|
| Hero H1 | serif | 400 | `clamp(44px, 6.5vw, 86px)` | `-0.028em` | 1.04 |
| Section H2 | serif | 400 | `clamp(28px, 4vw, 52px)` | `-0.026em` | 1.08 |
| Card title | serif | 400 | 22px | normal | 1.2 |
| Big numeral (01/02/03) | serif | 400 | 112px | `-0.05em` | 0.85 |
| Body | sans | 400 | 15–17px | normal | 1.72–1.82 |
| Eyebrow label | sans | 600 | 11px | `0.18em` UPPERCASE | — |
| Nav link | sans | 400 | 13px | normal | — |
| Button | sans | 500 | 13–14px | normal | — |

## Routing changes

```
/                       → public landing (replaces current app/page.tsx)
/login                  → public, restyled
/signup                 → public, restyled
/upload                 → auth-gated; target-form + dropzone
/report/[resumeId]      → auth-gated; redesigned visualization
/auth/callback          → unchanged
/api/*                  → unchanged
```

`proxy.ts` (Next.js 16 middleware replacement) gains:
- `/upload` → require user; redirect to `/login?next=/upload` if not authenticated
- `/report/:path*` → same pattern

The post-upload redirect in `components/upload/upload-form.tsx` continues to point at `/report/[resumeId]`.

## Copy rewrites

The design's hero subhead and FAQ contain factually wrong claims about the system. Per user direction, replace with copy that is **both accurate and pitches the actual sophistication**.

### Hero

```
Line 1 (default):  Let's be real: AI is being used in job recruiting.
Italic accent:     See how AI sees you
Subhead:           Four frontier LLMs and three ATS parsers read your resume in
                   parallel. tyr surfaces where they agree, where they disagree,
                   and what that gap tells you about how you'll be read.
Primary CTA:       Decode my resume →
Secondary CTA:     [hidden in v1]
```

### FAQ (5 items, replacing the design's 4)

```
Q: Which AI models does tyr use?
A: Four heterogeneous frontier LLMs — GPT-4o, Claude Sonnet, Gemini, and
   Llama 3.1 70B. Each receives the same eight structured queries about your
   resume. We measure numerical disagreement (σ across scalar judgments) and
   reasoning dispersion (ρ across embedded explanations). Disagreement is
   treated as a calibrated uncertainty signal, not noise.

Q: How does the ATS analysis work?
A: Three independent parsers run in parallel — Affinda's commercial NER, the
   open-source OpenResume engine, and our own deterministic extractor. We
   normalize their outputs into a canonical schema and score where they
   diverge. High parser disagreement is itself a finding: it predicts that
   real-world ATSes will read your resume inconsistently.

Q: What does disagreement actually tell me?
A: Two readings. High σ on a scalar query (e.g. seniority) means LLM-powered
   screeners will reach different conclusions about you depending on which one
   they use — your resume reads ambiguously. High ρ on reasoning text means
   the models are looking at different signals to arrive at their answer —
   your resume is multi-interpretable. Both are addressable with concrete edits.

Q: Is my resume stored?
A: Yes — encrypted at rest in a row-level-security-isolated Postgres instance
   keyed to your account. You can delete it at any time. We never train models
   on user data and never share your resume with third parties.

Q: How accurate is this?
A: The disagreement score is robust by construction — if three parsers extract
   the same field, real ATSes overwhelmingly will too. The σ and ρ metrics are
   calibrated against a 5,000-resume reference distribution. We do not claim
   to predict any specific employer's hiring decision; we measure how the
   AI layer of the funnel reads you, with explicit uncertainty.
```

### ScrollReveal panels

Keep the three-panel structure. Lightly update for accuracy:

```
01  Every resume goes through                 (unchanged)
    a machine first.
    Before a human opens your file, automated systems parse, score, and
    filter. Most candidates never learn what was extracted — or what was
    missed.

02  Then four AI models describe              (changed from "two AI models")
    you to a recruiter.
    GPT-4o, Claude, Gemini, and Llama each summarize your experience, read
    your seniority, and flag gaps — all before a hiring manager sees your
    name. tyr measures where they agree and where they don't.

03  tyr decodes both into                     (lowercase wordmark)
    one judgment.
    One upload. Two complete reports. Your parser-disagreement score, your
    AI-legibility score, the per-query σ and ρ across models, and the exact
    edits that move both numbers.
```

### HowItWorks step cards

```
1  Upload
   Drop your PDF. tyr accepts any layout — multi-column, tables, exotic fonts.

2  Parallel analysis
   Three parsers and four LLMs run simultaneously, exactly like the hiring
   stacks you'll apply to.

3  Your judgment
   Disagreement scored, σ and ρ surfaced, AI-legibility quantified, and
   concrete edits flagged for both reports.
```

### ReportPreview cards (landing-only mock; doesn't reflect a real resume)

Keep the visual structure. Update labels to match what the real report shows:

```
ATS Report (sage accent)              AI Perception Report (clay accent)
"Parser agreement: 87%"               "AI-legibility: 74 / 100"
- Contact parsed: 3/3 sources         - Recruiter summary: "Mid-level
                                         engineer, backend focus"
- Date alignment: 92%                 - Seniority σ: 1.2 across 4 models
- Bullet count variance: low          - Reasoning ρ: 0.18 (low dispersion)
- Inter-modal δ: 0.4 (mild gap)       - Top fix: quantify 3 bullet points
```

### Sample insights quotes

Keep all three; they're plausible and don't make false claims about the system.

### Footer

```
tyr
Named after the Norse god of justice and fairness.

Product           Company
- Upload resume   - About
- How it works    - Privacy
- FAQ             - Terms

© 2026 tyr. All rights reserved.
```

About / Privacy / Terms pages: stub `href="#"` for v1; M5 or later writes them.

## Component map (design HTML → Next.js)

| Design block (lines) | Becomes |
|---|---|
| `Nav` (121–145) | `components/landing/nav.tsx` (client — uses `useScroll`) |
| `Hero` (148–247) | `components/landing/hero.tsx` (client — parallax, scroll-driven opacity) |
| `useScroll` (110–118), helpers (104–107) | `lib/scroll/use-scroll.ts` + `lib/scroll/easings.ts` |
| `ExplodedView` (267–357) | `components/landing/exploded-view.tsx` (client — progress-driven) |
| `ScrollReveal` (369–447) | `components/landing/scroll-reveal.tsx` (client — sticky 380vh container) |
| `HowItWorks` (450–481) | `components/landing/how-it-works.tsx` (server — pure markup) |
| `ReportPreview` (484–540) | `components/landing/report-preview.tsx` (server) |
| `SampleInsights` (543–578) | `components/landing/sample-insights.tsx` (server) |
| `FAQ` (581–617) | `components/landing/faq.tsx` (client — accordion state) |
| `Footer` (620–654) | `components/landing/footer.tsx` (server) |
| `TweaksPanel` + tweaks-panel.jsx | **dropped** — editor-mode scaffolding |

`app/page.tsx` becomes:
```tsx
import { Nav } from '@/components/landing/nav'
import { Hero } from '@/components/landing/hero'
// …
export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <ScrollReveal />
      <HowItWorks />
      <ReportPreview />
      <SampleInsights />
      <FAQ />
      <Footer />
    </>
  )
}
```

## /upload redesign

`app/upload/page.tsx` (new):

```
[ tyr nav, scrolled state ]

  ───────────────────────────────────────────────
                  Upload your resume
  Two reports — ATS structural and AI perceptual.
  ───────────────────────────────────────────────

  ┌────────────────────────── target ─┐
  │  Target role     [SWE        ⌄]   │   ← required, dropdown of common
  │  Target company  [Google         ]│      roles + freeform employer
  └───────────────────────────────────┘

  ┌────────────────── drop or click ──┐
  │                                   │
  │         drop your PDF here        │   ← styled dropzone
  │                                   │
  └───────────────────────────────────┘
  PDF only · ≤10MB · Encrypted at rest
```

The two-field "target" form sits **above** the dropzone; both must be filled before upload is enabled. Plumb through:

1. `components/upload/target-form.tsx` — controlled form, validation
2. POST `/api/upload` body extends with `{ target_role, target_company }`
3. Persist to a new column `resumes.target_role` / `resumes.target_company` (migration `0004_target_metadata.sql`)
4. `lib/agents/load-resume.ts` reads them and threads into the graph context
5. `lib/llm/perceive.ts` q4 prompt template gains `${target_role} at ${target_company}` — replaces M3's "most-likely target inferred from most-recent experience"
6. **Cache key** must include target — bump prompt version to `v2` in `prompts.lock.json` since q4's prompt template now varies per request

Acceptance: a single resume uploaded with `(SWE, Google)` and again with `(IB Analyst, JPMorgan)` produces **different** q4 responses (cache miss confirms target plumbing).

## /report/[resumeId] redesign

Full reimagining. Two-column primary layout matching the landing's `ReportPreview` aesthetic.

### Layout

```
[ tyr nav, scrolled state ]

  ─────────────────────────────────────────
  ⌐ eyebrow ⌐  YOUR JUDGMENT
              {filename}
              Analyzed {N} seconds ago · {target_role} at {target_company}
  ─────────────────────────────────────────

  ┌─────────────────── headline scores ────────────────────┐
  │  ┌───────────┐    ┌───────────┐    ┌───────────────┐   │
  │  │ Parser    │    │ AI-legi-  │    │ Inter-modal δ │   │
  │  │ agreement │    │ bility    │    │ {value}       │   │
  │  │ {N%}      │    │ {N/100}   │    │ {gap label}   │   │
  │  │ sage      │    │ clay      │    │ marigold      │   │
  │  └───────────┘    └───────────┘    └───────────────┘   │
  │   (number counts up from 0 on viewport entry)          │
  └────────────────────────────────────────────────────────┘

  ┌──────────────────────────  ┌──────────────────────────┐
  │ ATS REPORT                │ AI PERCEPTION REPORT     │
  │ Structural parse          │ AI interpretation        │
  ├──────────────────────────┤├──────────────────────────┤
  │ Per-field disagreement   ││ Per-query σ / ρ grid    │
  │ matrix (M2)              ││ (M3) — 8 rows, 4 models │
  │ - contact: 0.0 (perfect) ││ - seniority: σ=1.2 ρ=.18│
  │ - dates: 0.08            ││ - tech depth: σ=0.9 ρ=.11│
  │ - employers: 0.04        ││ - …                     │
  │ - bullets variance: …    ││                         │
  │ - parser pair diffs ↓    ││ - reasoning preview ↓   │
  │   (collapsible accordion)││   (per-query, expand)   │
  └──────────────────────────┘└──────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │ TOP STRENGTHS (consensus across LLMs, q3)            │
  │   • {strength 1}                                     │
  │   • {strength 2}                                     │
  │   • {strength 3}                                     │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │ MISSING SIGNAL (consensus across LLMs, q7)           │
  │   {text}                                             │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │ Caveat                                                │
  │   AI-legibility weights are placeholder until M5      │
  │   (calibration against real outcomes). The σ and ρ    │
  │   metrics are direct measurements and reliable.       │
  └──────────────────────────────────────────────────────┘
```

### Animations

- **Number count-up** on the three headline score cards. Use `requestAnimationFrame`, ease-out, ~900ms. Trigger on viewport entry via `IntersectionObserver`.
- **Fade-up reveal** on each section as it scrolls into view (same `fade-up` keyframe as landing).
- **σ/ρ grid bars**: width animates from 0 to value over 600ms staggered by row index (50ms per row).
- **Parser pair diff accordion**: smooth `max-height` transition (380ms ease) matching the landing FAQ pattern.
- **Inter-modal δ indicator**: a horizontal needle on a sage→clay gradient bar; needle lerps to its position over 700ms.

All animations respect `prefers-reduced-motion: reduce` — gate with a single `useReducedMotion` hook in `lib/scroll/use-reduced-motion.ts`.

### Components (new)

```
components/report/
  hero.tsx                     -- filename, target, timestamp eyebrow
  headline-scores.tsx          -- 3-card row with count-up
  parser-disagreement-card.tsx -- M2 viz: per-field, accordion for pair diffs
  perception-grid.tsx          -- M3 viz: 8-row σ/ρ grid w/ animated bars
  inter-modal-delta.tsx        -- needle indicator
  consensus-list.tsx           -- top strengths (q3) bullet list
  consensus-text.tsx           -- missing signal (q7) prose block
  caveat-card.tsx              -- placeholder-weights disclaimer
  count-up.tsx                 -- shared number animation primitive
```

### Data fetching

The page is a server component at `app/report/[resumeId]/page.tsx`. Single Supabase query joining:

```sql
select
  r.id, r.file_name, r.target_role, r.target_company, r.created_at,
  pd.overall_score as parse_agreement,
  pd.field_disagreement, pd.parser_pair_diffs,
  pr.apeds_features, pr.ai_legibility_score,
  pqr.* as query_responses
from resumes r
left join parse_disagreement pd on pd.resume_id = r.id
left join perception_reports pr on pr.resume_id = r.id
left join perception_query_responses pqr on pqr.resume_id = r.id
where r.id = $1 and r.candidate_id = auth.uid()
```

Build the joined payload server-side, hydrate into client components for animations.

## Schema additions

### `infra/supabase/migrations/0004_target_metadata.sql`

```sql
alter table resumes
  add column target_role text,
  add column target_company text;

-- Backfill: existing rows get null; downstream code treats null as
-- "fall back to inferred target" (M3 behavior preserved for old rows).
```

No RLS changes — existing `resumes` policies cover the new columns.

## Acceptance criteria

| # | Criterion | Status type |
|---|---|---|
| 1 | `npx tsc --noEmit` and `npx next build` clean | AUTO |
| 2 | `tyr` wordmark appears in `<title>`, nav logo, and footer; no instances of "AI Hiring Decoder" remain in user-visible surfaces | AUTO (grep) |
| 3 | Tailwind config exposes all 11 palette colors as named tokens; `font-serif` and `font-sans` resolve to Instrument Serif / Inter | AUTO |
| 4 | Landing renders all 8 sections in order with no layout shift on first paint (no hydration flash on the static sections) | RUNTIME (lighthouse + visual) |
| 5 | Hero video autoplays muted on mobile and desktop; falls back gracefully if `<video>` is blocked | AUTO + RUNTIME |
| 6 | Parallax + scroll-driven animations match the design's progress curves (fade-up easings, opacity ramps); 60fps on a mid-tier laptop | RUNTIME |
| 7 | `prefers-reduced-motion: reduce` disables all transform-based animations site-wide | AUTO + RUNTIME |
| 8 | FAQ accordion: keyboard-accessible (Enter/Space toggles, Tab navigates), `aria-expanded` set correctly | AUTO |
| 9 | `/` is publicly accessible; `/upload` and `/report/*` redirect unauthenticated users to `/login?next=…` | AUTO + RUNTIME |
| 10 | `/upload` requires both target role and target company before enabling the dropzone; values persist to `resumes.target_role/target_company` | RUNTIME |
| 11 | The same resume uploaded with two different `(target_role, target_company)` values produces different q4 responses (cache key correctly includes target) | RUNTIME |
| 12 | Migration `0004_target_metadata.sql` applies cleanly on a fresh project (`0001`→`0002`→`0003`→`0004`) | RUNTIME |
| 13 | `/report/[resumeId]` renders all 6 sections (hero, headline scores, ATS card, AI card, consensus list, consensus text, caveat) with real data from the joined query | RUNTIME |
| 14 | Headline scores animate count-up on first viewport entry; σ/ρ grid bars animate width on entry; inter-modal needle lerps to position | RUNTIME |
| 15 | All copy rewrites land verbatim — hero subhead, 5 FAQ items, ScrollReveal panels, HowItWorks cards, ReportPreview labels, footer | AUTO |
| 16 | Auth pages (`/login`, `/signup`) restyled to the palette + type system; not 1:1 with the design (no design provided) but consistent | RUNTIME |
| 17 | Mobile responsive: landing legible at 375×812; hero scales without overflow; ScrollReveal collapses to a stacked single-column layout below 900px | AUTO + RUNTIME |
| 18 | Lighthouse Performance ≥ 85 on the landing page (LCP < 2.5s, CLS < 0.1) | RUNTIME |
| 19 | `npm test` — all M2 + M3 tests still green; new tests for `target-form` validation, `count-up` math, `useScroll` cleanup, `useReducedMotion` | AUTO |
| 20 | No `console.error` or React hydration warnings on any of the 4 routes (`/`, `/login`, `/upload`, `/report/[id]`) | RUNTIME |

## Things deliberately NOT in M4

- Outcome 5-layer schema (applied/responded/interviewed/offered/accepted) — M5
- "Did you hear back?" follow-up email cron — M5
- Sample-judgment page (`/sample`) — deferred per user direction
- About / Privacy / Terms pages (stub footer links) — M5+
- Pricing page — out of scope (no pricing in design)
- Tyr-Auth (perplexity / burstiness) UI — M5+
- Disagreement-AUC empirical validation — gated on outcomes (M5+)
- §5 TG-HCG, §6 CHPE, §8 conformal scoring, §9 recommender — months 6+
- Repository / npm package rename from `ai-hiring-decoder` to `tyr` — separate cleanup PR

## Predictions for downstream milestones

- **M5 outcome schema** will add a fourth headline score on the report page — *outcome status* (applied / responded / interviewed / offered / accepted), surfaced as a stacked timeline. M4's `headline-scores.tsx` should be designed to accept N cards, not hardcoded to 3, so M5 just appends one.
- **M5 follow-up emails** will need a Resend (or equivalent) integration; the auth pages already collect email so plumbing is straightforward.
- **M6 TG-HCG embeddings** will add a "similar profiles" cohort histogram to the report page. M4's report layout reserves vertical space below the consensus blocks for this section.
- **The placeholder caveat copy** ("AI-legibility weights are placeholder until M5") removes itself in M5 once weights are learned. Keep the caveat as a single-source-of-truth component (`caveat-card.tsx`) so a one-line change retires it.
- **About / Privacy / Terms** copy is a marketing/legal task more than an engineering one. M5 can stub them with template content; real legal review happens before public launch.

## Risks

1. **Scroll-driven animations are fragile under SSR.** All scroll-listening components must be `'use client'`. The sticky 380vh `ScrollReveal` container relies on viewport height — must use `100dvh` not `100vh` on mobile (iOS Safari URL bar issue) and re-measure on resize. Verified by spot-test on iPhone Safari + Chrome desktop.
2. **Hero video file size.** `upscaled-video.mp4` size unknown until copied. If >5MB, transcode to a 720p H.264 + AV1 dual-source variant. Acceptance criterion 18 (LCP < 2.5s) gates this.
3. **Babel-in-browser → React Server Components translation.** The design is one big babel-compiled blob. Splitting into client/server components correctly is the main porting risk. Rule of thumb: anything using `useState`, `useEffect`, `useRef`, `useScroll`, or event handlers becomes `'use client'`. Static markup (HowItWorks, ReportPreview, SampleInsights, Footer) stays as server components.
4. **Tailwind v4 vs v3 syntax.** Confirm which version `package.json` has before extending the config — v4 uses `@theme` in CSS, v3 uses `tailwind.config.ts`. Adjust accordingly. (M1's `app/globals.css` likely indicates which.)
5. **Cache invalidation on prompt-template change.** Adding `${target_role} at ${target_company}` to q4's template means every cached q4 response is now stale-keyed. Bump `v1` → `v2` in `prompts.lock.json`; the build-time hash check from M3 will fail until the bump is committed. This is intended — M3's safeguard working as designed.
6. **Animation jank on the σ/ρ grid.** 8 rows × staggered 50ms = 400ms total reveal. Some browsers (Safari) hiccup on simultaneous `width` transitions. Use `transform: scaleX` instead of `width` for the bar fill — GPU-accelerated, jank-free.
7. **Animations look great on a 16" MacBook and bad on a $500 laptop.** Test on a low-end machine before locking acceptance criterion 6. If 60fps is unreachable, drop the parallax velocity coefficient (currently 0.22 in the design) to 0.12.
8. **The "encrypted at rest" copy in the FAQ is true at the Postgres level (Supabase encrypts disks) but the Storage bucket also needs to be private.** M1 set the bucket to private; double-check before publishing.
9. **Mobile parallax is generally a bad idea.** iOS Safari fires scroll events less frequently when scrolling with momentum. Disable parallax (set translateY/scale to identity) when `window.innerWidth < 900` — better than a janky version.

## Suggested implementation order

1. **Foundation** — palette to `tailwind.config.ts`, fonts via `next/font`, copy `hero.mp4` to `public/`, brand rename pass (page titles, layout metadata, footer). Verify build still passes. (~½ session)
2. **Routing restructure** — create `app/upload/page.tsx`, move M1 upload logic out of `app/page.tsx`, add `proxy.ts` gates. Stub `app/page.tsx` with a `"landing soon"` placeholder. Verify auth flow + redirects. (~½ session)
3. **Landing — static sections first** — `Footer`, `HowItWorks`, `ReportPreview`, `SampleInsights`, `FAQ` (server components, easy wins). Pure markup + Tailwind. (~1 session)
4. **Landing — Nav + Hero** — `useScroll` hook, parallax video, fade-up content. Verify mobile responsive. (~1 session)
5. **Landing — ScrollReveal + ExplodedView** — the hardest piece. Sticky 380vh, three-panel left, progress-driven exploded right. Get it 60fps before moving on. (~1 session)
6. **`/upload` redesign + target-form + plumbing** — new form component, API body extension, migration `0004`, prompt template `v2` bump, cache reset. (~½ session)
7. **`/report/[resumeId]` redesign** — server component does the joined Supabase query; client components do the animations. Build `count-up`, `headline-scores`, `parser-disagreement-card`, `perception-grid`, `inter-modal-delta`, `consensus-list`, `consensus-text`, `caveat-card`. (~1 session)
8. **Auth page restyle** — light pass on `/login` and `/signup` to match palette + type. (~¼ session)
9. **Polish + a11y** — `useReducedMotion`, keyboard FAQ, focus rings, mobile breakpoints, Lighthouse pass. (~½ session)
10. **Verification** — write `docs/MILESTONE_4_VERIFICATION.md` with status per criterion, screenshots in `docs/m4-screens/`. (~¼ session)

Estimated 5–6 working sessions. The animation polish is the variable — set a hard time-box and ship "good enough" if hour 8 hits, with a follow-up issue tracking deeper polish.
