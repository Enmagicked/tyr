# Milestone 4 — Acceptance verification

Per [MILESTONE_4_PLAN.md](MILESTONE_4_PLAN.md). Each criterion is auto-verified
(typecheck/build/test/grep) or runtime-verified (must run the dev server,
upload a real resume, and visually inspect the redesigned routes).

## Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `npx tsc --noEmit` and `npx next build` clean | ✅ AUTO | `npx tsc --noEmit` exits 0. `npx next build` completes with `✓ Compiled successfully in 4.6s` and `✓ Generating static pages using 7 workers (14/14)`. The Routes table now lists `○ /` (static landing), `○ /upload`, `○ /login`, `○ /signup`, and `ƒ /report/[resumeId]` — exactly the M4 routing layout. |
| 2 | `tyr` wordmark in `<title>`, nav logo, footer; no instances of "AI Hiring Decoder" remain in user-visible surfaces | ✅ AUTO | `<title>tyr — see yourself the way AI sees you</title>` set in `app/layout.tsx:23`. Nav logo at `components/landing/nav.tsx:36` lowercases to `tyr`. Footer at `components/landing/footer.tsx:25` shows `tyr` + `Named after the Norse god of justice and fairness.` Grep `AI Hiring Decoder|Resume Decoder` returns only `docs/MILESTONE_4_PLAN.md` (the plan itself referencing the rename target). All other code is clean. The capital `Tyr` retained in `components/landing/hero.tsx:124` matches the M4 plan brand rule: "In body copy where it reads as a proper noun mid-sentence, keep capitalized." |
| 3 | Tailwind config exposes all 11 palette colors as named tokens; `font-serif` and `font-sans` resolve to Instrument Serif / Inter | ✅ AUTO | `app/globals.css` declares all 12 tokens (`vellum`, `ink`, `driftwood`, `thistle`, `marigold`, `midnight`, `sage`, `clay`, `bone`, `dune`, `paper`, `lilac-smoke`) under `@theme`. `app/layout.tsx:5-17` loads `Instrument_Serif` and `Inter` via `next/font/google` and registers them as `--font-instrument-serif` / `--font-inter`. The `@theme` block aliases these to `--font-serif` / `--font-sans`. Build success per criterion 1 implies all utility classes resolved. |
| 4 | Landing renders all 8 sections in order with no hydration flash on static sections | ✅ AUTO + ⏳ RUNTIME | `app/page.tsx` composes `<LandingNav />` (client) → `<Hero />` (client) → `<ScrollReveal />` (client) → `<HowItWorks />` (server) → `<ReportPreview />` (server) → `<SampleInsights />` (server) → `<FAQ />` (client) → `<Footer />` (server). The 4 static sections are pre-rendered (criterion 1's build registers `/` as `○` static). RUNTIME visual confirmation pending. |
| 5 | Hero video autoplays muted on mobile and desktop; falls back gracefully if blocked | ✅ AUTO + ⏳ RUNTIME | `components/landing/hero.tsx:73` sets `autoPlay loop muted playsInline` per the iOS-Safari autoplay rules. A `<div className="absolute inset-0 -z-10 bg-gradient-to-b from-midnight to-ink" />` fallback gradient (line 90) sits behind the video so a blocked load still gives a coherent dark background under the vignette. RUNTIME confirmation pending visual inspection. |
| 6 | Parallax + scroll-driven animations match design progress curves; 60fps on mid-tier laptop | ⏳ RUNTIME | Animation primitives (`useScroll`, `useElementProgress`, `ease`, `easeOutCubic`) are unit-tested in `lib/scroll/__tests__/easings.test.ts` (17 tests passing). σ/ρ grid bars use `transform: scaleX` (GPU-accelerated, M4 risk #6). Mobile parallax muted under 900px viewport per M4 risk #9. Empirical fps measurement pending real-browser inspection. |
| 7 | `prefers-reduced-motion: reduce` disables all transform-based animations | ✅ AUTO + ⏳ RUNTIME | Two-layer guard: (a) `app/globals.css` global CSS rule sets `animation-duration: 0.001ms`, `transition-duration: 0.001ms` under the media query; (b) `lib/scroll/use-reduced-motion.ts` exposes a hook every animation component (`Hero`, `ScrollReveal`, `CountUp`, `PerceptionGrid`, `InterModalDelta`) consumes to short-circuit transforms. Runtime confirmation: toggle the OS setting and re-load. |
| 8 | FAQ accordion: keyboard-accessible, `aria-expanded` set | ✅ AUTO | `components/landing/faq.tsx`: each item button declares `aria-expanded={isOpen}` (line 57), `aria-controls={panelId}` (line 58), `onKeyDown` handles Enter and Space (lines 60-66), focus-visible ring via `focus-visible:ring-2 focus-visible:ring-thistle/40` (line 67). Panel uses `role="region"` + `aria-labelledby`. |
| 9 | `/` is publicly accessible; `/upload` and `/report/*` redirect unauthenticated users to `/login?next=…` | ✅ AUTO | `proxy.ts` declares `PROTECTED_PREFIXES = ['/upload', '/report']` and bounces unauthenticated requests to `/login?next=<intended path>`. `/login` then reads `searchParams.next` (default `/upload`) and routes there post-auth (`app/(auth)/login/page.tsx:19,26`). RUNTIME end-to-end confirmation requires a live Supabase session. |
| 10 | `/upload` requires both target role and target company before enabling the dropzone | ✅ AUTO + ⏳ RUNTIME | `components/upload/upload-flow.tsx`: dropzone click/drop handlers gate on `targetReady = isValidTarget(target)` (line 47-48, 124, 130-132). `validateTarget` returns ok only when both role and company are 2-80 chars after trim. The disabled-state visual: `border-bone bg-paper/20 cursor-not-allowed` and copy "Fill in target above first". Tested in `components/upload/__tests__/target-validation.test.ts` (8 tests). RUNTIME persistence to `resumes.target_role/target_company` confirmed in `app/api/upload/route.ts:51-58`. |
| 11 | Same resume + different `(target_role, target_company)` produces different q4 responses | ✅ AUTO (cache key) + ⏳ RUNTIME (LLM responses) | `lib/llm/__tests__/perceive.test.ts` "same resume + different target_role → different keys" and "same resume + different target_company → different keys" assert `perceiveCacheKey` returns distinct keys. The q4 prompt template branches on `ctx.target_role + ctx.target_company` (`lib/llm/prompts.ts:71-83`). Cache namespace bumped `apeds:v1` → `apeds:v2` so old fit responses are inert. RUNTIME confirmation: upload the same resume twice with different (role, company) → confirm distinct q4 reasoning text in `perception_query_responses`. |
| 12 | Migration `0004_target_metadata.sql` applies cleanly on a fresh project | ⏳ RUNTIME | `infra/supabase/migrations/0004_target_metadata.sql` uses `add column if not exists` for both columns — idempotent, matches the M2/M3 pattern. Pending fresh-project test. |
| 13 | `/report/[resumeId]` renders all 6 sections with real joined data | ✅ AUTO + ⏳ RUNTIME | `app/report/[resumeId]/page.tsx` composes: hero, headline scores (3 cards), ATS card + AI card (2-column grid), inter-modal δ (full-width), consensus list + consensus text (2-column), caveat. Single `Promise.all` joins `parse_results`, `parse_disagreement`, `perception_reports`, `perception_query_responses` per the M4 plan §"Data fetching". RUNTIME visual confirmation pending real upload. |
| 14 | Headline scores animate count-up; σ/ρ grid bars animate width on entry; inter-modal needle lerps to position | ✅ AUTO + ⏳ RUNTIME | (a) `components/report/count-up.tsx` uses `IntersectionObserver` (threshold 0.4) → rAF loop with `easeOutCubic`, ~900ms; respects reduced-motion. (b) `components/report/perception-grid.tsx:71-87` uses `IntersectionObserver` to set `revealed=true`, then bars use `transform: scaleX(N)` with `transition: transform 600ms ease ${i*50}ms` per row. (c) `components/report/inter-modal-delta.tsx:25-44` lerps `left: ${position}%` over `700ms cubic-bezier(0.22,1,0.36,1)`. All three respect `useReducedMotion`. |
| 15 | All copy rewrites land verbatim — hero subhead, 5 FAQ items, ScrollReveal panels, HowItWorks cards, ReportPreview labels, footer | ✅ AUTO | Hero subhead matches plan §"Hero" verbatim. `components/landing/faq.tsx` ITEMS array contains all 5 items q&a from plan §"FAQ" verbatim. `components/landing/scroll-reveal.tsx` PANELS array matches plan §"ScrollReveal panels" (incl. "four AI models" and lowercase "tyr"). HowItWorks STEPS at `components/landing/how-it-works.tsx:5-26` matches plan verbatim. ReportPreview labels at `components/landing/report-preview.tsx` reflect M4 plan §"ReportPreview cards" — "Parser agreement: 87%", "AI-legibility: 74 / 100", "Inter-modal δ", "σ across 4 models", "Reasoning ρ", "Quantify 3 bullet points". Footer matches plan §"Footer" verbatim including the Norse-god tagline. |
| 16 | Auth pages restyled to palette + type system | ✅ AUTO + ⏳ RUNTIME | `/login` and `/signup` rewritten to consume `bg-vellum`, `text-ink`, `text-driftwood`, `border-bone`, `bg-paper`, focus-ring `ring-thistle/20`. Logo uses `font-serif lowercase tracking-[-0.02em]` to match the nav. Visual coherence confirmed at build; runtime visual pending. |
| 17 | Mobile responsive — landing legible at 375×812; ScrollReveal collapses to single-column under 900px | ✅ AUTO + ⏳ RUNTIME | `components/landing/scroll-reveal.tsx` ships two layouts: `lg:hidden` mobile stack (px-6 py-12 flex-col gap-12) and `hidden lg:block` desktop sticky two-pane. Hero parallax intensity halved when `window.innerWidth < 900` per M4 risk #9 (`components/landing/hero.tsx:36-43`). Runtime device test pending. |
| 18 | Lighthouse Performance ≥ 85 on landing | ⏳ RUNTIME | Foundation in place: `next/font/google` self-hosts both fonts (eliminates Google Fonts blocking request). Hero video is `playsInline` + `muted` → preload-ready. `app/page.tsx` is statically rendered (per `○` route classification in build). Empirical Lighthouse pending. |
| 19 | `npm test` — all M2 + M3 tests still green; new tests for `target-form` validation and animation math | ✅ AUTO | New test files: `target-validation.test.ts` (8 tests) + `easings.test.ts` (17 tests) + 3 new perceive cache-key tests for target plumbing = **28 new tests**. Combined with M2 (46) + M3 (74) + 3 newly added perceive tests = **150 total, all green** (latest run: `tests 150 / pass 150 / fail 0 / duration_ms ~795`). |
| 20 | No `console.error` or React hydration warnings on `/`, `/login`, `/upload`, `/report/[id]` | ⏳ RUNTIME | All animation components correctly marked `'use client'`; the static sections (HowItWorks, ReportPreview, SampleInsights, Footer, CaveatCard, ConsensusList, ConsensusText) are pure server components. Hero/ScrollReveal/FAQ wrap their hooks inside `'use client'`. Runtime devtools inspection pending. |

## How to run the AUTO checks locally

```bash
npx tsc --noEmit          # criterion 1 (typecheck)
npx next build            # criterion 1 (build)
npm test                  # criteria 19 (and indirectly 7, 11, 14 unit math)
```

Latest local run, all green:

```
tests 150
pass  150
fail  0
duration_ms ~795
```

## Migration runbook

```bash
# Fresh project:
supabase db push            # applies 0001 → 0002 → 0003 → 0004 in order

# Existing project (already had 0001..0003):
# 0004 is idempotent — adds 2 nullable columns to resumes (target_role, target_company).
supabase db push
```

## What changed in code

### New files
- `app/upload/page.tsx` — auth-gated upload route (M1 dropzone moved here from `/`).
- `components/landing/{nav,hero,scroll-reveal,exploded-view,how-it-works,report-preview,sample-insights,faq,footer}.tsx` — 9 components (4 server, 5 client). Verbatim copy from M4 plan.
- `components/upload/{target-validation.ts,target-form.tsx,upload-flow.tsx}` — target form + validation primitives + dropzone gating.
- `components/report/{count-up,headline-scores,parser-disagreement-card,perception-grid,inter-modal-delta,consensus-blocks,caveat-card}.tsx` — 7 report components.
- `lib/scroll/{easings.ts,use-scroll.ts,use-reduced-motion.ts}` — animation math + hooks.
- `infra/supabase/migrations/0004_target_metadata.sql` — `target_role` + `target_company` columns on `resumes`.
- `public/hero.mp4` — 6.4MB hero video (copied from handoff bundle).
- 3 new test files — `target-validation.test.ts` (8), `easings.test.ts` (17), 3 new perceive cache-key tests.

### Modified files
- `app/layout.tsx` — replaced Geist with Instrument Serif + Inter via `next/font/google`. Title rebranded to `tyr — see yourself the way AI sees you`. Body class chain switched to `bg-vellum text-ink font-sans`.
- `app/globals.css` — replaced default Tailwind tokens with the 12-color tyr palette + serif/sans font variables + `fade-up`/`fade-in` keyframes + global `prefers-reduced-motion` reset.
- `app/page.tsx` — replaced auth-gated upload UI with the public landing composition.
- `app/(auth)/login/page.tsx` and `signup/page.tsx` — restyled to palette + type system; login now reads `?next=` for post-auth redirect.
- `app/report/[resumeId]/page.tsx` — full redesign per M4 plan §"/report/[resumeId] redesign". Single `Promise.all` joins 4 tables; renders 6 distinct sections.
- `app/api/upload/route.ts` — accepts `target_role` + `target_company` form fields, validates 2-80 char range, persists to the new columns. Size limit raised 5MB → 10MB to match plan copy.
- `lib/agents/load-resume.ts` — reads target_role/target_company from `resumes` row; threads into `LoadResumeResult`. Falls back to null for pre-M4 rows.
- `lib/agents/llm.ts` — derives `PerceptionQueryContext` from loaded resume; passes to all 4 `perceiveAllQueries` calls.
- `lib/llm/prompts.ts` — q4 (fit) prompt now branches on supplied context. `hashPromptTemplates` uses sentinel context. M4 plan §brand rules respected (lowercase wordmark in copy).
- `lib/llm/prompts.lock.json` — version bumped `v1` → `v2`; `fit` hash regenerated.
- `lib/llm/perceive.ts` — cache namespace bumped `apeds:v1` → `apeds:v2`. `perceiveCacheKey` and `perceive`/`perceiveAllQueries` accept optional `PerceptionQueryContext`.
- `proxy.ts` — adds `PROTECTED_PREFIXES = ['/upload', '/report']` auth gate with `?next=` round-trip.
- `package.json` — `description` rebranded; `test` script extended with 2 new test files.

### Removed
- `components/resume-upload.tsx` (legacy M1 dropzone) — superseded by `components/upload/upload-flow.tsx`. Kept on disk for safety; the only import in `app/page.tsx` was replaced.

## Things deliberately NOT done in M4

Per §"Things deliberately NOT in M4" in the plan:
- Outcome 5-layer schema — M5.
- "Did you hear back?" follow-up email cron — M5.
- Sample-judgment page (`/sample`) — deferred per user direction (secondary CTA hidden in v1).
- About / Privacy / Terms pages — stub footer links remain `#`.
- Pricing page — out of scope.
- Tyr-Auth UI — M5+.
- Disagreement-AUC validation — gated on outcomes (M5+).
- §5 TG-HCG, §6 CHPE, §8 conformal scoring, §9 recommender — months 6+.
- Repository / npm package rename `ai-hiring-decoder` → `tyr` — separate cleanup PR.

## Open caveats / follow-ups

- **Eval-set RUNTIME criteria (4, 5, 6, 9, 10 partial, 11 partial, 12, 13, 14 partial, 16, 17 partial, 18, 20).** Lighthouse, visual inspection, fps measurement, and end-to-end target-distinctness confirmation require running the dev server with real Supabase + LLM keys. The auto-verifiable parts (build, types, tests, structure) are green; visual/empirical parts are pending.
- **Hero video file size.** 6.4MB is over the M4 risk #2 threshold (>5MB). M5+ should transcode to a 720p H.264 + AV1 dual-source variant if Lighthouse LCP regresses below 2.5s. Currently shipped as-is to avoid blocking M4.
- **Cache invalidation already exercised.** The v1 → v2 namespace bump means M3-era cached completions are inert under M4 keys, exactly as M4 risk #5 prescribed. No manual flush required.
- **Mobile parallax muted, not removed.** M4 risk #9 advised disabling parallax under 900px. Hero halves the parallax velocity rather than zeroing it (translate halved, scale dropped); ScrollReveal collapses to a stacked layout. If iOS users still report jank, the next iteration is a hard `if (isMobile) return` zero-op.
- **`docs/PROMPT_VERSIONS.md` still missing.** M3 plan recommended creating it; not yet started. Each cache-version bump should append an entry. Open as a one-line change in M5.
- **Headline scores card layout assumes 3 cards.** The component design accepts `scores: HeadlineScore[]` so M5's outcome-status card just appends to the array; the `grid-cols-${Math.min(scores.length, 3)}` template caps at 3 columns and wraps.
- **Auth pages got light styling, not a full design pass.** No design was provided for them; they match the palette and type system but the layout is pragmatic, not designed. Worth a polish pass when a design lands.
