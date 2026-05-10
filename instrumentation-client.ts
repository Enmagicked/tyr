// Client-side instrumentation. Runs after HTML is loaded but before React
// hydration — see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md
// Earliest possible point to wire up an error reporter.

import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Replay sessions are off by default — too expensive for the free tier.
  // Add when we have a specific bug we can't otherwise reproduce.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
})

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: '/ingest',
  ui_host: 'https://us.posthog.com',
  defaults: '2026-01-30',
  capture_exceptions: true,
  debug: process.env.NODE_ENV === 'development',
})

// Surfaces App Router navigation events to Sentry as breadcrumbs so error
// reports include the navigation that led up to the throw.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
