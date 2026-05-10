// Server-side instrumentation. Next.js calls register() once per server
// instance before requests are handled. Per Next 16 file-conventions docs:
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
//
// Sentry init is split per-runtime so we don't pull node-only modules into
// the edge bundle.

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // Sample 100% of errors but only 10% of perf transactions in prod —
      // the free tier covers 5K errors and 10K transactions/mo.
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      // Reasonable default; bump if we start needing more breadcrumbs to
      // reproduce upload-pipeline failures.
      maxBreadcrumbs: 50,
    })
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    })
  }
}

// Forwards any uncaught server error (RSC, route handler, server action) to
// Sentry. Without this, only client-side errors get captured automatically.
export const onRequestError = Sentry.captureRequestError
