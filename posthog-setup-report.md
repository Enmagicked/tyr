<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into tyr — the AI resume analyzer. Here is a summary of all changes made:

**New files created:**
- `instrumentation-client.ts` — extended with `posthog.init()` using the `/ingest` reverse proxy, `capture_exceptions: true`, and the `2026-01-30` defaults. Runs before React hydration.
- `lib/posthog-server.ts` — server-side PostHog client factory (`posthog-node`) with `flushAt: 1` / `flushInterval: 0` for immediate event delivery from Next.js route handlers.

**Modified files:**
- `next.config.ts` — added `/ingest/*` rewrites to route PostHog traffic through the app (avoids ad-blockers) and `skipTrailingSlashRedirect: true`.
- `app/(auth)/login/page.tsx` — calls `posthog.identify(userId, { email })` then captures `user_logged_in` on successful sign-in.
- `app/(auth)/signup/page.tsx` — calls `posthog.identify(userId, { email })` then captures `user_signed_up` on successful sign-up.
- `components/upload/upload-flow.tsx` — captures `resume_upload_started` (with role, file size), `analysis_completed` (with resumeId/runId), `resume_upload_failed` (with error message), and `posthog.captureException()` on errors.
- `app/api/upload/route.ts` — server-side `resume_upload_completed` event after DB insert, keyed to `user.id`.
- `app/api/analyze/route.ts` — server-side `analysis_started` event after graph launch, keyed to `user.id`.
- `app/report/[resumeId]/page.tsx` — server-side `report_viewed` event (top of engagement funnel), keyed to `user.id`.
- `components/account/account-actions.tsx` — captures `user_signed_out` + `posthog.reset()` on sign-out; captures `account_deleted` + `posthog.reset()` on account deletion.

**Environment:**
- `.env.local` updated with `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST`.
- Packages added: `posthog-js`, `posthog-node`.

---

## Events instrumented

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User successfully signed up and got a confirmation email | `app/(auth)/signup/page.tsx` |
| `user_logged_in` | User signed in with email/password | `app/(auth)/login/page.tsx` |
| `resume_upload_started` | User selected/dropped a PDF and upload request was sent | `components/upload/upload-flow.tsx` |
| `resume_upload_completed` | Resume stored in Supabase and saved to DB (server-side) | `app/api/upload/route.ts` |
| `resume_upload_failed` | Upload flow hit an error (bad PDF, validation, server error) | `components/upload/upload-flow.tsx` |
| `analysis_started` | Analysis graph launched for a resume (server-side) | `app/api/analyze/route.ts` |
| `analysis_completed` | Graph completed and user redirected to report | `components/upload/upload-flow.tsx` |
| `report_viewed` | User opened a resume report page (server-side) | `app/report/[resumeId]/page.tsx` |
| `user_signed_out` | User clicked Sign out in account settings | `components/account/account-actions.tsx` |
| `account_deleted` | User confirmed full account and data deletion | `components/account/account-actions.tsx` |

---

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/1566761)
- [Signup → Upload → Report funnel](/insights/yZU2TMxf) — conversion from signup through first report view
- [New signups over time](/insights/s7KVYlpQ) — daily signups and logins trend
- [Resume uploads over time](/insights/RfHtLtQS) — uploads started, completed, and failed per day
- [Upload success rate](/insights/v4lcjPOS) — completed / started × 100 formula
- [Churn signals — account deletions & sign-outs](/insights/iDyYP9bf) — account deletions and sign-outs over time

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
