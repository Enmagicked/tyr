# M9 — Few-shot calibration inputs

Spec for the curated examples needed to add few-shot calibration to the 4 scalar perception queries. **You curate these; I wire them into the prompts.**

## Why we're doing this

The 4 scalar queries (`seniority`, `technical_depth`, `final_round_probability`, `ai_authored`) currently get **zero-shot** prompts — the model sees the rubric and has to anchor itself. Different models anchor differently → noisy disagreement that's partly model-quirk, not real read of the candidate.

Adding 2-3 calibrated examples per query forces every model to anchor against the *same* reference points. The σ between models tightens, and the disagreement that remains is genuinely about the candidate, not "GPT-4o defaults to 7.5, Claude defaults to 6."

## What I need from you

Three example resumes per query, spanning the score range. Same resume can serve multiple queries (e.g., a Stripe senior engineer might anchor `seniority=8` AND `technical_depth=7`).

**Realistically, 4-5 distinct resume excerpts mapped across the 4 queries.** Not 12 separate documents.

For each query, I need three anchors covering low / mid / high. The exact anchor values are below.

### Anchors per query

| Query | Range | Low anchor target | Mid anchor target | High anchor target |
|---|---|---|---|---|
| `seniority` | 1–10 | ~3 (junior, 0-2 yrs) | ~6 (mid, 4-6 yrs) | ~8 (senior/staff, 8+ yrs) |
| `technical_depth` | 1–10 | ~3 (CRUD apps, no system design) | ~6 (services + some design) | ~8 (distributed systems, deep stack) |
| `final_round_probability` | 0–1 | ~0.10 (resume that gets screened out) | ~0.35 (decent but not standout) | ~0.65 (strong signal, would advance) |
| `ai_authored` | 0–1 | ~0.10 (clearly human-written, idiosyncratic) | ~0.45 (polished, ambiguous) | ~0.85 (uniform rhythm, generic verbs, no detail) |

You don't need to hit those exact numbers — within ±1 (or ±0.1 for the 0-1 scales) is fine. The point is to span the range.

## Format template

Save as a single file: `docs/M9_few_shot_examples.md`. Use exactly this structure so I can parse it without ambiguity:

```markdown
# Few-shot calibration examples

## Resume A — short alias for reference

[Paste 200-400 words of resume text here. This is what the model will see
as the "example resume." Real or synthetic both work — synthetic is fine
if anonymizing real ones is annoying. Lightly format like a real resume:
roles, dates, bullets. No need for headers/contact since the perception
queries don't use those.]

### Calibration

- seniority: 8 — Six years at high-growth startups, leads a 4-person team, owns the payments infra end-to-end. Title says "senior" but scope is staff-adjacent.
- technical_depth: 7 — Distributed systems, has shipped Kafka pipelines and rebuilt the auth layer; no public talks or open-source presence pulls it down from 8.
- final_round_probability: 0.55 — Strong but not extraordinary; the lack of brand-name employers and absence of measurable impact in the bullets caps it.
- ai_authored: 0.15 — Idiosyncratic phrasing ("the migration that ate three sprints"), inconsistent tense, specific failure stories. Reads human.

---

## Resume B — alias

[200-400 words]

### Calibration

- seniority: 3 — ...
- technical_depth: ...
- ...
```

**Each calibration line MUST be one of those four query keys, a colon, the score, an em-dash, and a 1-2 sentence rationale.** I'll regex-parse this — keep the format strict.

You can omit a query for a given resume if it doesn't make sense (e.g., a designer's resume probably shouldn't anchor `technical_depth`). I'll handle missing entries.

## Coverage requirement

Across all your examples, each query needs:

- **At least one example near the low anchor**
- **At least one near the mid anchor**
- **At least one near the high anchor**

Three examples per query minimum. Five per query is better but diminishing returns past that.

## Tips

- **Real resumes work great** if you have a small stash from your network — just anonymize names + employer names. Replace `Stripe` with `[Series B fintech]` or invent `Acme Corp`. Schools too.
- **Synthetic is fine.** A plausible 300-word resume is enough. Don't agonize over polish.
- **The rationale matters more than the score.** Why you picked that number is the calibration signal — it tells the LLM what evidence to weight. Two sentences is the sweet spot. One sentence is too thin; a paragraph is too much for the prompt budget.
- **Span the range.** A pile of "6/10" examples teaches the model nothing. Cover edges.
- **`ai_authored` is the trickiest.** Pick examples where you have a strong intuition either way. The middle of the scale (~0.45-0.55) is the most useful anchor because it teaches "honest uncertainty looks like this."

## Common pitfalls — please avoid

- **Don't reuse a famous resume verbatim.** A LinkedIn-scraped Sundar Pichai resume could be in the model's training data and bias the calibration. Use original or heavily edited text.
- **Don't pick examples where reasonable people would disagree by ±2.** Calibration anchors should be ones you'd defend strongly. If you're not sure, pick a different example.
- **Don't go over 400 words per resume.** Each example eats prompt budget × 4 queries × every LLM call. Tight is better.
- **Don't include identifying info** if these are real resumes — even paraphrased. Names, school + grad year, current employer + title is enough to identify someone.

## When you're done

Drop the file at `docs/M9_few_shot_examples.md` and tell me. I'll plug them into `lib/llm/prompts.ts` (each scalar query gets a `Examples:` section before the resume text), bump the cache namespace, regenerate the lockfile, and run the prod smoke test.

## Estimated time

~2 hours if you use real anonymized resumes from your network. ~3-4 hours if synthesizing from scratch.

## Out of scope here

The other M9 work — self-consistency N=3 sampling — needs no input from you. I'll wire it in code; just costs ~3× LLM spend per upload (still pennies at current scale).
