# Known issues & follow-ups

Snapshot as of 2026-05-06, post-M5 deploy. Live URL: https://tyr-mauve.vercel.app.
Triage in tiers — items in tier 1 should land before publicly sharing the URL.

> **2026-05-10 update — M6 partial:** code-side items 1.1, 1.5, 1.6, 2.5, 2.9, 2.10, 3.5 landed; ops items 1.2, 1.3, 1.4, 1.7, 2.4 still ⏳. See `docs/MILESTONE_6_VERIFICATION.md`.

---

## Tier 1 — block before public launch

### 1.1 OCR for scanned PDFs *(user-flagged during M4)*
**Symptom:** Upload of an image-only / scanned PDF returns 422 with "PDF contained no extractable text." User is told why and given a hint, but there's no path forward in-app.
**Why it matters:** A meaningful share of real-world resumes are scanned (PDF exports of LinkedIn profiles, photographed-then-PDF'd resumes from older candidates). They get hard-rejected today.
**Fix path:** Either (a) add Tesseract.js as a fallback when `pdf-parse` returns < 50 chars, or (b) re-use Affinda's text-extraction API (we already have the key) — Affinda OCRs natively. Option (b) is faster to ship and higher quality.
**Effort:** M, ~half-day.

### 1.2 Email rate limit will throttle 3rd+ signup
**Symptom:** Supabase free-tier SMTP sends only ~2 confirmation emails / hour. User #3 today gets "email rate limit exceeded."
**Why it matters:** Defeats the funnel for any organic batch of signups.
**Fix path:** Wire **Resend** (3000 emails/mo free) as custom SMTP in Supabase Auth settings. Already documented in DEPLOY.md §6.
**Effort:** S, ~1 hour.

### 1.3 Delete-my-data not tested on prod
**Symptom:** The `/account` UI ships with a "Delete all my data" flow that does cascading cleanup of storage + DB + auth.users. The code is right by inspection but has never been exercised end-to-end on prod.
**Why it matters:** If the cascade is wrong, the user thinks their data is gone but it isn't — and we can't tell without a real run.
**Fix path:** Sign up a throwaway test account, upload a resume, walk through the delete flow, then verify with service-role REST queries that all related rows + storage objects are gone.
**Effort:** S, ~30 min.

### 1.4 No error monitoring
**Symptom:** Production errors are visible only by manually scrolling Vercel runtime logs at the right timestamp.
**Why it matters:** Will miss errors that don't crash the page; even when they do, attribution is slow.
**Fix path:** `npm install @sentry/nextjs && npx @sentry/wizard@latest -i nextjs`. Sentry free tier covers ~5K errors/mo.
**Effort:** S, ~1 hour.

### 1.5 Target company shouldn't be required *(user-flagged 2026-05-10)*
**Symptom:** Upload form forces a company selection. In practice users want a decode against a *role* (and maybe a job description), not a specific employer they may not have in mind.
**Why it matters:** Friction on the one screen between signup and value. Also forces the LLM "fit" prompt to invent context when the company is generic.
**Fix path:** Make `target_company` optional end-to-end: form, `/api/upload` validation, `lib/llm/prompts.ts` q4 (fit) — degrade gracefully when absent (drop the company clause from the prompt; do **not** bump cache version unless prompt text changes for the *with-company* path). Update copy on `/upload` to say company is optional.
**Effort:** S, ~1-2 hours.

### 1.6 Summary copy is filler + jargon *(user-flagged 2026-05-10)*
**Symptom:** The plain-English summary surfaces lines like *"all 3 automated resume parsers successfully opened and read your file — a good baseline, meaning your PDF isn't corrupted or locked"* and unexplained terms like *"critical structural failure."* The first is meaningless to the user; the second is jargon without translation.
**Why it matters:** The summary is the headline value of the report. Filler erodes trust; jargon makes the user feel talked-down-to without informed.
**Fix path:** Edit [lib/agents/synthesize-summary.ts](lib/agents/synthesize-summary.ts) prompt to (a) ban "successfully parsed / not corrupted / good baseline" type filler explicitly, (b) require any technical phrase ("structural failure", "canonical field", "parser disagreement") to be glossed inline in plain English, (c) end every paragraph with one concrete next-step the user can take. Bump `apeds_summary:v1` → `v2` per §3.5.
**Effort:** S, ~1-2 hours (mostly prompt iteration + re-running the smoke test).

### 1.7 No funnel analytics
**Symptom:** No data on landing→signup→upload→report drop-off rates.
**Why it matters:** Soft launch without analytics is a wasted soft launch — you can't tell what's working.
**Fix path:** PostHog free tier (`posthog-js`). 6 events specced in DEPLOY.md §6: `landing_view`, `cta_click`, `signup_complete`, `upload_start`, `upload_complete`, `report_view`.
**Effort:** S, ~1-2 hours.

---

## Tier 2 — visible quality bugs

### 2.1 Bullet extraction is parser-fragile *(surfaced in M5 smoke test)*
**Symptom:** The M5 prod smoke-test upload produced `bullet_analysis.total_bullets = 0` because the highest-scoring parser (OpenResume) didn't populate `canonical_data.experience[].bullets[]` for that specific PDF.
**Why it matters:** When `total_bullets` is 0, the M5 plain-English summary's `experience_paragraph` reads thinly ("0 of 0 bullets quantified") and provides little actionable signal — even when the resume actually has rich experience content.
**Fix path:** Three options:
- **(a)** `analyze_bullets` should fall back to a different parser when the highest-scoring one has 0 bullets (cheap; doesn't fix the root cause).
- **(b)** Audit `lib/parsers/openresume.ts` and `lib/parsers/naive.ts` bullet extraction — the cleanest section is whichever block of `description` text follows a date range; consider re-splitting via `splitBullets()` from `normalize.ts` after the fact.
- **(c)** When `bullet_analysis.total_bullets === 0`, suppress the experience_paragraph in the report instead of rendering Claude's "0 of 0" summary.
**Effort:** M for (b), S for (a)+(c). Recommend (a)+(c) ship together and (b) as a real M6 effort.

### 2.2 Affinda parser silently scores 0.0 *(flagged M4, unaddressed)*
**Symptom:** Affinda writes a `parse_results` row but with `parse_score: 0.0`. The `synthesizeParse` aggregate still runs (the row exists), but the parser-disagreement signal degrades because Affinda's canonical fields are empty.
**Why it matters:** We have 2 effective parsers (OpenResume + naive) instead of 3. M2's parser-disagreement score loses sample size.
**Fix path:** Inspect `lib/parsers/affinda.ts` — likely either (a) the API response shape changed in Affinda's v3 endpoint, (b) the API key has limited permissions on the trial tier, or (c) the parser's score computation has a bug that always returns 0. Run a single resume against Affinda's API directly via `curl` and compare to what `parseWithAffinda()` produces.
**Effort:** M, ~2-3 hours.

### 2.3 No password reset flow
**Symptom:** `/login` has no "Forgot password?" link. Users locked out of their account have no recovery path.
**Why it matters:** Will hit users immediately at any meaningful scale.
**Fix path:** Standard Supabase `auth.resetPasswordForEmail` flow — one new screen, one API call. Note: also requires custom SMTP (1.2) to avoid rate limits.
**Effort:** S, ~1 hour.

### 2.4 Hero video is 6.4 MB *(LCP risk, flagged M4)*
**Symptom:** Lighthouse LCP regression risk on slow connections. Video plays inline as the hero background.
**Why it matters:** Mobile + slow-network users see the page render slowly; landing engagement suffers.
**Fix path:** `ffmpeg -i public/hero.mp4 -vf scale=-2:720 -crf 28 -c:v libx264 public/hero-720.mp4` typically gets it to 1-2 MB. Or add an AV1 dual-source variant for modern browsers.
**Effort:** T, ~30 min.

### 2.5 Parsers misread standard section headers as content *(user-flagged 2026-05-10)*
**Symptom:** Section headers like "Experience", "Education", "Skills" are sometimes captured as bullet text or company/role values inside `canonical_data`, polluting the report (and downstream the bullet analysis + LLM perception).
**Why it matters:** Obvious-looking mistakes destroy credibility faster than any subtle one. A user who sees "Experience" listed as a job title stops reading.
**Fix path:** Add a header-blocklist post-processor in [lib/parsers/normalize.ts](lib/parsers/normalize.ts) (case-insensitive match against the canonical resume-section vocabulary) that strips matching strings from `experience[].role/company/bullets`, `education[].school`, etc. Cheaper than fixing each parser individually. Add a determinism test with a fixture resume that has bare headers.
**Effort:** S, ~2 hours.

### 2.6 Job-post / job-keyword as alternative target input *(user-flagged 2026-05-10)*
**Symptom:** Today the only "target" signal is the role-and-maybe-company text fields. Real users have a job posting in front of them.
**Why it matters:** A pasted JD (or screenshot of one) gives the fit/perception prompts radically more grounded context than `target_role` alone — the same resume reads differently against an SRE JD vs. a platform-eng JD with the same title.
**Fix path:** Two inputs on `/upload` in addition to the role field: (a) paste a JD as text, (b) upload an image of a job post (re-use the same OCR path as 1.1 once that lands; until then, gate on text paste). Plumb the JD into `ctx.target_jd` and into the `fit` + `top_strengths` + `missing_signal` prompts. Bump `apeds:v2` → `v3` since the prompt surface changes.
**Effort:** M, ~half-day for text-paste; another half-day for image input after 1.1.

### 2.7 Resume input beyond PDF: website URL, image *(user-flagged 2026-05-10)*
**Symptom:** Only PDF uploads are accepted. Users with a personal site or only a screenshot of their resume can't get a decode.
**Why it matters:** A meaningful slice of designers / juniors / non-traditional applicants live on personal sites; older / non-technical users often have only an image.
**Fix path:**
- **URL ingest:** new endpoint that fetches the URL server-side, strips to readable text via a sanitizer (e.g., Mozilla Readability), feeds the text into the same `load_resume` ctx as a synthetic "parsed" payload. Watch for SSRF — block private IPs / localhost.
- **Image ingest:** convert via the OCR path from 1.1, then feed extracted text the same way.
Both paths converge on the existing graph; the only branching is in `load_resume` / upload validation.
**Effort:** M for URL (~half-day incl. SSRF guard); S for image after 1.1 lands.

### 2.8 Report visualization is thin *(user-flagged 2026-05-10)*
**Symptom:** Numeric outputs (σ/ρ grid, parser disagreement, AI-legibility, inter-modal δ) are mostly text + a single needle/gradient. No comparative visuals, no shape to glance at.
**Why it matters:** The headline value prop is "see where models agree/disagree." Disagreement screams to be a chart, not a table.
**Fix path:** Add 2-3 small SVG visualizations in [components/report/](components/report/): (a) a per-query bar chart of model scores with σ as an error bar, (b) a small radar/spider for the 6 scalar perception axes across the 4 LLMs, (c) a horizontal stacked bar for parser agreement on each canonical field. Keep it raw SVG — no chart-lib dependency. Defer cohort histograms to 3.2.
**Effort:** M, ~1 day.

### 2.9 More actionable advice in the report *(user-flagged 2026-05-10)*
**Symptom:** Report explains *what* the models saw but rarely tells the user *what to do next*. Coupled with 1.6 — the summary describes findings but doesn't translate them into edits.
**Why it matters:** Users want a TODO list, not a diagnosis.
**Fix path:** Extend `synthesize_summary` to emit a structured `recommendations: string[]` (3-5 items max), each tied to a specific finding (low quantification → "add a metric to your top 3 bullets at $employer"; high inter-modal δ on seniority → "tighten the role title or add scope language"). Render as a checklist block in the report. Pairs naturally with the prompt rewrite in 1.6.
**Effort:** S, ~2-3 hours on top of 1.6.

### 2.10 No `/test` route audit
**Symptom:** `app/test/page.tsx` shipped to production (visible in Vercel route table as `○ /test`).
**Why it matters:** If it's leftover dev scaffolding, it's exposing internals on a public URL.
**Fix path:** Read the file; either delete it or auth-gate it via `proxy.ts`.
**Effort:** T, ~10 min.

---

## Tier 3 — gated on more data / future milestones

### 3.1 Outcome capture *(M6)*
**Why it matters:** AI-legibility weights are placeholder — they need real outcome data ("did they get the job?") to learn from. Until M6 captures applied/responded/interviewed/offered/accepted, the score is unvalidated.
**Effort:** L, full milestone.

### 3.2 Per-LLM cohort histograms *(M6+)*
**Why it matters:** "Your seniority of 7 vs population mean of 6.4" type comparisons are the single most-asked question in user feedback at scale, but useless without 100+ uploads to compute the population.
**Effort:** S once cohort data exists.

### 3.3 Reports list pagination
**Why it matters:** A user with 100 reports will fetch all rows. Acceptable until someone has >50.
**Effort:** S when needed.

### 3.4 Real legal copy for `/privacy` and `/terms`
**Symptom:** Footer links currently point to `#`.
**Why it matters:** Required before any GDPR-jurisdiction users land.
**Fix path:** Not engineering — copywriting + legal review. Defer until you have a launch date.

### 3.5 `docs/PROMPT_VERSIONS.md`
**Symptom:** Each prompt-template change should bump a cache version (M3 lockfile mechanism enforces this for the perceive suite). The synthesize_summary cache version (`apeds_summary:v1`) has no equivalent enforcement.
**Why it matters:** Silent prompt edits will poison the summary cache.
**Fix path:** Mirror M3's lockfile pattern for `synthesize-summary.ts:buildPrompt`, or add a build-time hash assert.
**Effort:** S, ~1 hour.

---

## Tier 4 — speculative / nice-to-have

- **In-app resume editing** — explicitly out of scope per M5 plan
- **Tyr-Auth** (perplexity / burstiness for AI-detection) — interesting research, not a launch blocker
- **Self-consistency 3-sampling per LLM query** — would tighten σ but 3× the cost
- **4th LLM bench-marking** — once a 5th frontier model lands, swap in the cheapest of the existing 4

---

## How to use this doc

When picking next work: scan tier 1 first, ship one item end-to-end (commit + deploy + verify), then move on. Don't fan out across tiers — depth beats breadth here.

When this doc gets stale: items either get fixed (delete the entry) or get reclassified up/down a tier. If a tier 2 item starts blocking real users, promote it. If a tier 1 item is genuinely fine after launch, demote it.
