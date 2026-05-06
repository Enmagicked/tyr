# Soft launch playbook

Tyr is deployed. Now: get the first 20–50 real users through the
funnel, watch what happens, and let what you observe write the M5
brief. Read [DEPLOY.md](DEPLOY.md) first if anything in §1 below
isn't already in place.

The point of soft launch is **not** to acquire users at scale. It's
to learn three things:

1. Does the funnel actually convert? (landing → signup → upload → report)
2. Does the report tell users something they didn't know? (the value claim)
3. Where does it break in the wild? (failure modes you can't anticipate locally)

Twenty thoughtful uses beat a thousand drive-bys.

---

## 0. Hard pre-flight checklist

Before sending the link to a single human, every box checked:

- [ ] DEPLOY.md §5 smoke test passed end-to-end on prod with a real email
- [ ] Vercel Analytics enabled
- [ ] PostHog (or equivalent) firing the 6 events from DEPLOY.md §6
- [ ] UptimeRobot (or equivalent) probing the prod URL every 5 min
- [ ] Tested on iOS Safari (not just Chrome desktop)
- [ ] Tested with a 10MB+ PDF, a corrupted PDF, an image-only scanned PDF, a `.docx` renamed to `.pdf`
- [ ] Watched one non-technical friend use the site for the first time without coaching, in person or over screenshare. Wrote down where they hesitated.
- [ ] You have a personal Slack/Notion page open as `docs/SOFT_LAUNCH_LOG.md` (or equivalent) to capture observations as they happen — don't trust your memory after the fact

The "watch one human use it" step is the highest-leverage 15 minutes of the entire launch. Do not skip.

---

## 1. Batch 1 — five close friends (day 1–2)

Target cohort: people you can ask honest questions and get honest answers. Yale CS / consulting / IB friends are ideal — they apply to the elite firms tyr is most calibrated for, and they care about hiring outcomes.

### Share

Direct message, individually. Not a group blast. Something like:

> built a thing that runs your resume through 3 ATS parsers and 4 frontier LLMs in parallel and shows you where they disagree. trying to figure out if the disagreement view is actually useful or just clever. would you take 10 min and try it + tell me honestly?
>
> https://tyr.app

That's it. Don't oversell. The link does the pitch.

### Ask, after they try it

In a follow-up message — not in the same one as the link, give them space to use it first:

1. *"What's the first thing that surprised you on the report?"*
2. *"Was the σ/ρ stuff legible or jargon-y?"*
3. *"Would you tell a specific friend about this? Who?"*
4. *"What would make you come back?"*
5. *"Where did you almost give up?"*

Q5 is the most important one. The drop-off points are where the M5 design lives.

### Capture

For every friend who tries it, log to `SOFT_LAUNCH_LOG.md`:

```
## [name], [date]
- target: SWE @ Stripe
- funnel reached: report
- time spent on report: 4 min
- surprise: didn't realize Affinda failed to parse the second job
- confusion: "what does ρ even mean"
- would tell: yes — recommended Sarah specifically
- would return: maybe, "if I update my resume"
- bug/issue: hero video stuttered on iPhone 11
```

After 5 of these, patterns emerge. Don't ship anything yet — just watch.

---

## 2. Batch 2 — twenty broader (day 3–5)

Once batch 1 confirms the funnel works and the report is interesting, broaden carefully.

### Where to share

Ranked by signal-to-noise:

1. **Yale CS / consulting / IB Slacks, GroupMes, Discords** — peers, low risk, high engagement
2. **Twitter/X**, posting *your own report as a screenshot* — methodology-led, not product-led:
   > i ran my resume through 4 frontier LLMs and they read me at three different seniority levels. built a tool that surfaces this. [screenshot]
3. **LinkedIn**, more polished version of the same — professional cohort, slower-moving
4. **r/csMajors**, posted as "I built X and want feedback" — *not* "check out my product." Mods kill self-promo posts; lead with what you learned, not what you sell.
5. **r/cscareerquestions** and **r/recruitinghell** — same rule, double down on tone. Both subs hate AI hype; lean into honest skepticism.
6. **Hacker News / Show HN** — only when batch 1+2 has already shaken out the obvious bugs. Premature HN posts are unrecoverable.

### Don't (yet)

- Reach out to journalists or ProductHunt. Wait until you have 50+ users and a coherent story.
- Run paid ads. The cost-per-click on hiring/recruitment keywords is brutal and you don't have conversion data to optimize against.
- Try to get on Yale Daily News / college press. Same reason as journalists.

---

## 3. What to track

Three dashboards, glanced at twice a day during launch.

### Funnel (PostHog)

```
landing_view → cta_click → signup_complete → upload_start → upload_complete → report_view
```

Healthy ratios for a soft launch with friends:

| Step | Healthy conversion | Red flag |
|---|---|---|
| landing → cta_click | ≥40% | <15% — landing isn't compelling, copy or hero broken |
| cta_click → signup_complete | ≥30% | <10% — auth flow friction |
| signup_complete → upload_start | ≥70% | <40% — target-form is friction or unclear |
| upload_start → upload_complete | ≥85% | <60% — pipeline failures, bad PDFs, timeouts |
| upload_complete → report_view | ≥95% | <80% — redirect or render bug |

If any step is in the red-flag zone, **stop sharing** and fix before continuing batch 2. A leaky funnel is a worse problem than a slow funnel.

### Pipeline health (Vercel logs + Supabase)

- LLM call latency p50, p95 — watch for one model dragging the rest
- Cache hit rate (Upstash dashboard) — should climb past 50% by upload #20, past 70% by #50
- `parse_disagreement.normalization_issues` — anything with `severity: 'high'` shows up here
- `perception_reports.normalization_issues` — same, on the LLM side
- Error rate on `/api/upload`, `/api/analyze` — should be <2%

### Cost (Vercel + LLM provider dashboards)

- Per-resume LLM cost — target ≤$0.30 cold, ≤$0.10 warm (M3 acceptance criterion 17)
- Total daily spend across OpenAI + Anthropic + Google + Together — set a budget alert at $20/day; if you blow through it before getting 50 uploads, something's wrong with the cache
- Vercel function invocations — free tier is 100k/mo, plenty

---

## 4. Failure modes to expect

Some of these you'll hit. Pre-write the response so you don't panic in the moment.

| What happens | Cause | Response |
|---|---|---|
| User uploads, gets stuck on "analyzing" forever | One LLM call hung, no timeout | Add a 60s timeout on every LLM call (M5 polish) |
| User signs up but never confirms email | Supabase confirmation email landed in spam | Customize email template + sender, link to a fallback "didn't get the email?" flow |
| User uploads, report shows mostly nulls | All 4 LLMs failed (rate limit, network blip) | M3 already handles this — `apeds_features: null` + caveat surfaces. Verify the caveat is visible. |
| User reports the parser misread something | Affinda hit a layout it doesn't like; OpenResume picked up the slack | This is *the value prop* — show them the disagreement view. If they didn't see it, the report UI is hiding it. |
| User asks "why isn't there an X" (ATS score, salary estimate, percentile rank) | Real feature gap | Note in `SOFT_LAUNCH_LOG.md`. If 3+ users ask the same thing, it's M5 scope. |
| Lighthouse drops on prod compared to local | Real-world network + Vercel cold start | Tolerate; only fix if LCP >3s consistently |
| Someone abuses the upload endpoint | No rate limit | Add per-IP rate limit on `/api/upload` (M5 polish — Upstash already in stack, ~30 lines) |

---

## 5. The M5 brief writes itself

After ~20 uploads, you'll have:

1. The actual funnel conversion ratios
2. A list of what users said the report was missing
3. A list of what users said was confusing
4. The most common target_role / target_company combos (= where calibration matters most)
5. Cache hit rate trajectory
6. The specific failure modes that hit production

This is the M5 input. Possible directions M5 could take, depending on what you saw:

- **If users return to update resumes**: build the diff view (re-upload → "what changed in your scores")
- **If users churn after the report**: outcome 5-layer schema is right — they need a reason to come back, "did you hear back?" emails
- **If users say "the σ stuff is jargon"**: M5 is a UX rewrite of the report, not new data
- **If users say "this is great but I want to know my chance"**: M5 starts the §6 CHPE work earlier than planned
- **If users say "my friend at JPM should see this"**: M5 is a referral / sharing feature, not data

Don't pre-decide. Let the data and conversations decide.

### When to draft M5

After the soft launch hits one of:
- 30 completed uploads, OR
- 10 days since deploy, OR
- A clear consensus across 5+ users on what's missing

Whichever comes first. Don't draft M5 before then — you'll be guessing.

When you do draft, the same shape as M2/M3/M4 plans. Cite specific entries from `SOFT_LAUNCH_LOG.md` as evidence for every scope decision.

---

## 6. Things deliberately NOT in soft launch

- No paid acquisition
- No press / journalists / ProductHunt
- No public roadmap / "coming soon" features
- No payment / pricing — fully free during soft launch (cost is bounded by cache + LLM ceiling, max few hundred dollars over the whole period)
- No mass email collection / waitlist
- No "refer a friend" mechanics — those distort the signal you're trying to read
- No A/B tests — sample size too small to be meaningful

The point is to *learn*, not *grow*. Growth comes after you know what you're building.

---

## 7. Hard rules during launch

1. **Respond to every user message within 24h.** Especially complaints. Soft-launch users who feel heard become evangelists; ignored ones become silent quitters.
2. **Don't argue with criticism.** "That's a great point, working on it" beats "well actually." Even when they're wrong.
3. **Don't deploy on Friday afternoon.** Issues compound when you're not watching.
4. **Don't read your metrics every 30 minutes.** It's tempting and it's noise. Twice a day, max.
5. **When you see something break in prod, fix-forward not roll-back** — unless the issue is data integrity. Users will see the rollback as ghosting.
6. **Keep the verification doc current.** If a runtime acceptance criterion that was ✅ becomes ❌ in prod, flip it back and fix.

---

## 8. Knowing when soft launch is "done"

You're done with soft launch when:

- The funnel ratios are stable across the last 10 uploads (no major drop-offs being discovered)
- You can answer "what's the next 3 features?" with confidence backed by user evidence
- You have ≥1 unsolicited "I told my friend about this" signal
- M5 plan exists and is grounded in observed behavior

That moment is when you can decide between (a) wider launch (pricing, ProductHunt, real marketing) or (b) keep iterating in private until M5 ships.

There is no shame in (b). Most products that try (a) too early die.
