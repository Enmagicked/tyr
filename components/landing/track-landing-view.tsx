'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

// Tiny client-only mount tracker for the landing page. Lets app/page.tsx stay
// a server component while still firing the top-of-funnel event. Capture
// runs once per mount; PostHog already captures pageviews automatically, but
// `landing_view` is the explicit funnel event the rest of the dashboard joins
// on — easier than filtering pageviews to the homepage.
export function TrackLandingView() {
  useEffect(() => {
    posthog.capture('landing_view')
  }, [])
  return null
}
