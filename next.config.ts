import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // pdf-parse uses Node.js fs — tell Next.js not to bundle it
  serverExternalPackages: ["pdf-parse"],
  // Disambiguate workspace root — there's a stray package-lock.json in the
  // user's home directory that Next would otherwise pick as root.
  turbopack: {
    root: here,
  },
};

// Sentry wrapper. Source-map upload requires SENTRY_AUTH_TOKEN — without it,
// errors still report fine but stack traces stay minified. Add SENTRY_ORG +
// SENTRY_PROJECT + SENTRY_AUTH_TOKEN to the env if you want readable traces;
// the wrapper auto-detects and skips upload if any are missing.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
});
