# Milestone 2 — Parse disagreement & canonical normalization

Pre-implementation plan. Fulfills the ATS half of §7.3 APEDS by making
parser disagreement a first-class measurable signal. Companion docs:
[MILESTONE_1_AUDIT.md](MILESTONE_1_AUDIT.md), [MILESTONE_1_VERIFICATION.md](MILESTONE_1_VERIFICATION.md).

## Why this milestone

The M1 audit's "Predictions for downstream milestones" called this out:

> M2 will need a `parse_disagreement` table and per-parser canonical
> normalization. The current `ParsedResume` type is a reasonable start
> but lacks contact subtypes (linkedin/github/personal_url split) and
> per-experience bullet arrays — both will be added then.

Today the 3 parsers (Affinda, OpenResume, naive) run in parallel and
their outputs are dumped into `parse_results.structured_data` as raw
JSON. There is no normalization, no comparison, and no surfaced
disagreement — so the recruiter-side ATS variance that APEDS is
supposed to measure is invisible. M2 fixes this.

## Issues to resolve

| # | Issue | Target file |
|---|---|---|
| F | `ParsedResume` lacks contact subtypes — `linkedin_url`, `github_url`, `personal_url`, `email`, `phone` collapsed into one bag | `types/resume.ts` (new — extracted from current inline types) |
| G | `experience[].description` is one string; parsers disagree on bullet boundaries | same |
| H | No canonical date format — Affinda returns `YYYY-MM`, OpenResume `MMM YYYY`, naive raw | `lib/parsers/normalize.ts` (new) |
| I | No employer-name canonicalization — "JPMorgan", "JPMorgan Chase & Co.", "JPM" treated as 3 distinct entities | same |
| J | No disagreement scoring — recruiter-side ATS variance invisible to user and to downstream perception | `lib/agents/disagreement.ts` (new) |
| K | No `parse_disagreement` table | `infra/supabase/migrations/0002_parse_disagreement.sql` (new) |
| L | Schema lives in one file (`lib/supabase/schema.sql`) — must move to versioned migrations before M2 schema writes can land | `infra/supabase/migrations/0001_baseline.sql` (new — port existing schema) |

## New components

### Canonical resume type — `types/resume.ts`

```ts
export type CanonicalContact = {
  email?: string
  phone?: string
  linkedin_url?: string
  github_url?: string
  personal_urls: string[]   // any other http(s) URL — portfolio, scholar, etc.
}

export type CanonicalEducation = {
  school_canonical_id: string   // see normalizer
  school_raw: string
  degree_normalized?: 'BS' | 'BA' | 'MS' | 'MA' | 'MBA' | 'PhD' | 'JD' | 'MD' | 'other'
  field?: string
  start_iso?: string            // YYYY-MM
  end_iso?: string              // YYYY-MM or null if current
  gpa?: number
}

export type CanonicalExperience = {
  employer_canonical_id: string
  employer_raw: string
  title_raw: string
  level_inferred?: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'exec'
  start_iso?: string
  end_iso?: string              // null if current
  bullets: string[]             // split on \n / • / - / numbered / sentence
  bullet_count: number
  char_count: number
}

export type CanonicalSkill = {
  name_canonical: string
  source: 'self' | 'inferred'
  weight?: number
}

export type CanonicalResume = {
  contact: CanonicalContact
  education: CanonicalEducation[]
  experience: CanonicalExperience[]
  skills: CanonicalSkill[]
}
```

### Normalizer — `lib/parsers/normalize.ts`

One pure function: `normalize(raw: unknown, parserName: ParserName) → { canonical: CanonicalResume, issues: NormalizationIssue[] }`.

Sub-utilities:
- `normalizeDate(input: string) → string | null` — accepts `YYYY-MM`,
  `MMM YYYY`, `Month YYYY`, `MM/YYYY`, `YYYY`. Returns ISO `YYYY-MM`
  or null. Use `date-fns/parse`.
- `splitBullets(description: string) → string[]` — split on `\n`, `•`,
  `– `, `- `, numbered prefixes, then on sentence boundaries if a
  single chunk is >250 chars.
- `canonicalizeEmployer(raw: string) → string` — Levenshtein against
  a seed dictionary of ~500 well-known firms (see below); return
  canonical ID if score ≥ 0.85, else slugify the raw string.
- `canonicalizeSchool(raw: string) → string` — same pattern, smaller
  seed dictionary (~200 universities).
- `classifyUrl(url: string) → 'linkedin' | 'github' | 'personal'` —
  hostname check.

**Employer seed dictionary** — start with the firms in the §1.10
base-rate table (GS, JPM, MS, BNP, McKinsey, BCG, Bain, Google, Meta,
Apple, Amazon, Netflix) plus the obvious adjacent set (top-20 IB,
MBB+T2 consulting, FAANG+, top quant funds, top PE/HF). Hardcode in
`lib/parsers/seed-employers.json`. The seed list is allowed to be
incomplete — unknown firms slugify and pass through.

### Disagreement scorer — `lib/agents/disagreement.ts`

Pairwise over the canonical outputs of the 2–3 surviving parsers:

```ts
type ParserPairDiff = {
  parser_a: string
  parser_b: string
  field_disagreement: Record<string, number>  // 0=identical, 1=fully different
  experience_alignment: number                 // 0..1, bipartite match fraction
  bullet_count_diff: number
}

type DisagreementResult = {
  field_disagreement: Record<string, number>   // mean over pairs
  experience_alignment: number                  // mean over pairs
  bullet_count_variance: number                 // Var across parsers per matched exp
  overall_score: number                         // weighted aggregate ∈ [0,1]
  parser_pair_diffs: ParserPairDiff[]
}
```

Scoring rules:
- Set-valued fields (skills, personal_urls): `1 − jaccard(A, B)`
- Scalar text (name, email, phone): `normalizedEditDistance(A, B)`
- Experience alignment: bipartite match on `(employer_canonical_id, start_iso)`
  tuples; score = matched / max(|A|, |B|)
- `overall_score = 0.4·mean(field_disagreement) + 0.4·(1 − experience_alignment) + 0.2·min(1, bullet_count_variance / 5)`

Edge cases:
- Only 1 parser succeeded → write a row with `overall_score = null`
  and `parser_pair_diffs: []`. Downstream code must treat null as
  "insufficient data" not "perfect agreement."
- 0 parsers succeeded → don't write a row; the `parse_resume` aggregate
  already failed and `save_results` handles that.

### New graph node — `compute_disagreement`

Add to `lib/agents/index.ts` between `parse_resume` and `save_results`:

```ts
{
  name: 'compute_disagreement',
  fn: computeDisagreement,
  optional_deps: ['parse_resume'],
}
```

Then `save_results` gains `optional_deps: ['parse_resume', 'perceive_resume', 'compute_disagreement']` so it persists the disagreement row when present.

## Schema additions

### `infra/supabase/migrations/0001_baseline.sql`

Verbatim port of the current `lib/supabase/schema.sql`. After this lands,
delete `lib/supabase/schema.sql` and update the README/runbook to use
`supabase db push` (or `psql -f`).

### `infra/supabase/migrations/0002_parse_disagreement.sql`

```sql
alter table parse_results
  add column canonical_data jsonb,
  add column normalization_issues jsonb not null default '[]'::jsonb;

create table parse_disagreement (
  id uuid default uuid_generate_v4() primary key,
  resume_id uuid references resumes on delete cascade unique not null,
  field_disagreement jsonb not null,
  experience_alignment numeric(4,3),       -- nullable when only 1 parser survived
  bullet_count_variance numeric,
  overall_score numeric(4,3),              -- nullable when only 1 parser survived
  parser_pair_diffs jsonb not null,
  computed_at timestamptz default now()
);

alter table parse_disagreement enable row level security;

create policy "users view own parse disagreement" on parse_disagreement for select
  using (exists (
    select 1 from resumes
    where resumes.id = parse_disagreement.resume_id
      and resumes.candidate_id = auth.uid()
  ));
```

Service-role inserts (no candidate-side insert policy needed — graph runs server-side under service role).

## Acceptance criteria

| # | Criterion | Status type |
|---|---|---|
| 1 | `npx tsc --noEmit` and `npx next build` clean | AUTO |
| 2 | Each parser writes both `raw_output` AND `canonical_data` to `parse_results` | AUTO + RUNTIME |
| 3 | Same resume run twice produces identical `canonical_data` per parser (determinism check via hash) | AUTO |
| 4 | `parse_disagreement` row exists per analyzed resume when ≥2 parsers succeeded; `overall_score ∈ [0,1]` | RUNTIME |
| 5 | When exactly 1 parser fails, disagreement still computes over the surviving 2 | AUTO |
| 6 | When 2 parsers fail, `parse_disagreement` row written with `overall_score = null` and `parser_pair_diffs: []` | AUTO |
| 7 | Employer canonicalization: "JPM", "JPMorgan", "JPMorgan Chase & Co." → same `canonical_id` on the 20-row golden set in `lib/parsers/__tests__/employers.test.ts` | AUTO |
| 8 | Date normalization: ≥95% of dates from a 50-resume eval set parse to valid ISO | RUNTIME |
| 9 | Migrations apply cleanly on a fresh Supabase project via `supabase db push` | RUNTIME |
| 10 | `parse_results.canonical_data` is non-null for ≥2 of 3 parsers in 95% of runs against a 20-resume eval set | RUNTIME |
| 11 | Report page (`/report/[resumeId]`) shows a "Parser agreement: 87%" badge with per-field breakdown when a `parse_disagreement` row exists | RUNTIME |
| 12 | The graph emits `node_started` / `node_completed` events for `compute_disagreement` (visible in the SSE stream) | AUTO + RUNTIME |

## Things deliberately NOT in M2

- Per-LLM disagreement (σ_j, ρ_j, ρ embeddings) — M3
- 4th LLM (Together / Llama-3.1-70B) — M3
- Upstash LLM cache — M3
- 64-d AI-perception vector projection (Tyr-APEDS §7.4) — M3
- Tyr-Auth (perplexity / burstiness / stylometric) — M5+
- Outcome schema (5-layer applied/responded/interviewed/offered/accepted) — M4
- Marketing landing page — M4
- Real report-page UI design — M4 (alongside landing)
- Any §5/§6/§7-deep work (TG-HCG, CHPE, structural ceiling) — months 6+

## Predictions for downstream milestones

- M3 will reuse `lib/agents/disagreement.ts` patterns for the LLM half:
  same shape (pairwise → aggregate), different metrics (numerical
  σ over scalar judgments, embedding cosine ρ over reasoning text).
  Refactor opportunity: extract a generic `pairwiseDisagreement<T>` helper
  in M3, not now.
- M3 will want `parse_disagreement.overall_score` as a feature input
  to the eventual conformal-CI widening (§8.3). M2 schema is shaped
  to support that without a follow-up migration.
- M4 (UI) will want both `parse_disagreement` and the future
  `perception_disagreement` joined into a single `/api/report/[id]`
  payload. Defer the API design until M3 lands so the shape is final.
- The `seed-employers.json` dictionary will need expansion based on
  what users actually upload. Track this in a `docs/SEED_GAPS.md` log
  starting M2.

## Risks

1. **Employer canonicalization quality.** The 500-firm seed list will
   miss the long tail. Acceptance criterion 7 tests the head — measure
   the tail in production via `normalization_issues` counts.
2. **Date parsing edge cases.** "Present", "Current", "Now", "—" all
   need to map to `null` end_iso; "Summer 2024" should map to
   `2024-06`; quarter notation ("Q3 2023") needs explicit handling.
   Hardcode in `normalize.ts` and unit-test.
3. **Bullet splitting over-segmentation.** Some resumes use period-
   separated bullets in a single line; some use semicolons; some put
   2 sentences per bullet. Conservative rule: split on hard breaks
   first; only sentence-split if a chunk exceeds 250 chars. Test
   against the 20-resume eval set.
4. **Migration ordering.** Porting `lib/supabase/schema.sql` to
   `0001_baseline.sql` must happen before `0002_parse_disagreement.sql`.
   On a fresh project they apply in order; on the user's existing
   project, `0001_baseline.sql` will be a no-op (idempotent via
   `if not exists`). Add `if not exists` everywhere in `0001`.

## Suggested implementation order

1. Port schema → `0001_baseline.sql` with `if not exists` everywhere.
   Delete `lib/supabase/schema.sql`. Verify on fresh project.
2. Extract types → `types/resume.ts`. Update existing parser return
   types to a discriminated union: `{ raw, canonical, issues }`.
3. Build `normalize.ts` + seed dictionaries + unit tests for dates,
   employers, bullets, URLs. This is the bulk of the work.
4. Wire normalization into each parser node (Affinda, OpenResume,
   naive). Verify `canonical_data` populates.
5. Build `disagreement.ts` + unit tests against synthetic 2- and
   3-parser inputs.
6. Add `compute_disagreement` graph node + acceptance test 12.
7. Add `0002_parse_disagreement.sql` migration. Update
   `save_results.ts` to write the new row + new columns.
8. Add the agreement badge to `/report/[resumeId]/page.tsx`. Minimal
   styling — M4 will redesign this page anyway.
9. Run end-to-end against the 20-resume eval set; record acceptance
   criteria 8 and 10 results in a new `docs/MILESTONE_2_VERIFICATION.md`.

Estimated 2–3 working sessions.
