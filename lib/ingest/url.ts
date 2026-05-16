// M8.C: server-side URL ingest for resume URLs (personal sites, GitHub
// READMEs, Notion pages, etc.). Two-stage:
//   1. Validate + fetch URL with SSRF guard (block private IPs, non-http
//      schemes, oversized bodies, slow servers).
//   2. Run Mozilla Readability over the parsed HTML to extract the main
//      article text — same library Firefox Reader View uses.
//
// Returned text is treated identically to PDF-extracted text downstream:
// fed to parseOpenResume + parseNaive + the 4 LLMs via lib/llm/perceive.ts.
//
// SSRF threat model: an authed user can submit any URL, which our backend
// then fetches. Without guards they could read internal AWS metadata
// (169.254.169.254/latest/meta-data/), localhost services, or LAN IPs.
// All such requests must fail-fast with a clear error.

import { JSDOM, VirtualConsole } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { lookup } from 'node:dns/promises'
import { Agent, fetch as undiciFetch } from 'undici'

// Limits — chosen to fit a Vercel function runtime budget. Adjust if a
// legitimate URL fails the guard for a defensible reason.
const MAX_REDIRECTS = 3
const MAX_BODY_BYTES = 5 * 1024 * 1024  // 5 MB
const FETCH_TIMEOUT_MS = 10_000          // 10 seconds
const MIN_USEFUL_CHARS = 200             // need at least this much extracted text

export class UrlIngestError extends Error {
  // Field declared separately (not as a parameter property) so Node's
  // strip-only TypeScript mode in node:test can parse this file. Parameter
  // properties require a real TS compiler — strip-only treats them as
  // unsupported syntax.
  statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'UrlIngestError'
    this.statusCode = statusCode
  }
}

// Private + reserved IPv4 ranges. Block all of these to prevent SSRF into
// the local network or cloud metadata services. IPv6 ranges blocked
// separately below.
const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^10\./,                                  // 10.0.0.0/8
  /^127\./,                                 // 127.0.0.0/8 (loopback)
  /^169\.254\./,                            // 169.254.0.0/16 (link-local, AWS metadata)
  /^172\.(1[6-9]|2\d|3[0-1])\./,            // 172.16.0.0/12
  /^192\.168\./,                            // 192.168.0.0/16
  /^0\./,                                   // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
  /^192\.0\.0\./,                           // IETF protocol assignments
  /^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, // documentation ranges
  /^224\./, /^225\./, /^226\./, /^227\./,
  /^228\./, /^229\./, /^230\./, /^231\./,
  /^232\./, /^233\./, /^234\./, /^235\./,
  /^236\./, /^237\./, /^238\./, /^239\./,   // 224.0.0.0/4 (multicast)
  /^255\.255\.255\.255$/,
]

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((re) => re.test(ip))
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true                   // loopback / unspecified
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true                    // fc00::/7 unique-local
  if (/^ff[0-9a-f]{2}:/.test(lower)) return true                       // multicast
  // ::ffff:a.b.c.d → IPv4-mapped IPv6; check the embedded IPv4 too
  const v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (v4mapped && isPrivateIpv4(v4mapped[1])) return true
  return false
}

export function validateUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new UrlIngestError('Not a valid URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlIngestError(`Only http(s) URLs are supported, not ${url.protocol}`)
  }
  // Reject userinfo (user:pass@host) — corner case used in some bypass tricks
  // and we have no use for it.
  if (url.username || url.password) {
    throw new UrlIngestError('URLs with embedded credentials are not allowed.')
  }
  // Hostname must be present; some malformed URLs parse with empty host
  if (!url.hostname) {
    throw new UrlIngestError('URL must include a hostname.')
  }
  // Reject obvious local-host strings before DNS even runs
  const hostLower = url.hostname.toLowerCase()
  if (
    hostLower === 'localhost' ||
    hostLower.endsWith('.localhost') ||
    hostLower === 'metadata.google.internal'
  ) {
    throw new UrlIngestError('URL resolves to a private host.')
  }
  return url
}

// Resolve hostname to an IP and verify it's not in a private range. Returns
// the first non-private address found so the caller can pin the connection
// to that exact IP — closing the DNS rebinding gap where fetch() would
// otherwise re-resolve at connect time and accept a freshly-poisoned reply.
async function resolveToPublicIp(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  // Numeric IPv4 literal — validate directly, no DNS.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIpv4(hostname)) {
      throw new UrlIngestError('URL resolves to a private host.')
    }
    return { address: hostname, family: 4 }
  }
  // Bracketed or bare IPv6 literal.
  const v6 = hostname.replace(/^\[|\]$/g, '')
  if (v6.includes(':') && !v6.includes('.')) {
    if (isPrivateIpv6(v6)) {
      throw new UrlIngestError('URL resolves to a private host.')
    }
    return { address: v6, family: 6 }
  }
  // Hostname → DNS lookup; check ALL records, return the first public one.
  let addrs: { address: string; family: number }[]
  try {
    addrs = await lookup(hostname, { all: true })
  } catch {
    throw new UrlIngestError(`Could not resolve ${hostname}.`)
  }
  for (const { address, family } of addrs) {
    if (family === 4 && isPrivateIpv4(address)) {
      throw new UrlIngestError('URL resolves to a private host.')
    }
    if (family === 6 && isPrivateIpv6(address)) {
      throw new UrlIngestError('URL resolves to a private host.')
    }
  }
  const first = addrs[0]
  if (!first) {
    throw new UrlIngestError(`Could not resolve ${hostname}.`)
  }
  return { address: first.address, family: first.family === 6 ? 6 : 4 }
}

// Back-compat shim for tests that imported the old name.
async function ensurePublicHost(hostname: string): Promise<void> {
  await resolveToPublicIp(hostname)
}

// Pin the TCP connection to a pre-validated IP via undici's `connect.lookup`
// hook. Closes the DNS rebinding gap: even if the hostname re-resolves to a
// private IP between validation and connect, we feed undici the cached
// public IP. Returns a fresh dispatcher per request so the IP doesn't leak.
function pinnedDispatcher(ip: { address: string; family: 4 | 6 }) {
  return new Agent({
    connect: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lookup: ((_hostname: string, _opts: unknown, cb: any) =>
        cb(null, ip.address, ip.family)) as never,
    },
  })
}

async function fetchHtml(initialUrl: URL): Promise<string> {
  let url = initialUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Re-validate every hop. validateUrl re-runs scheme + userinfo +
    // localhost checks; resolveToPublicIp re-runs DNS + private-range checks.
    if (hop > 0) {
      url = validateUrl(url.toString())
    }
    const ip = await resolveToPublicIp(url.hostname)
    const dispatcher = pinnedDispatcher(ip)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Awaited<ReturnType<typeof undiciFetch>>
    try {
      response = await undiciFetch(url.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        dispatcher,
        headers: {
          'User-Agent': 'tyr-resume-decoder/1.0 (+https://usetyr.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new UrlIngestError('Fetch timed out after 10 seconds.', 504)
      }
      throw new UrlIngestError(
        `Could not reach ${url.hostname}: ${err instanceof Error ? err.message : 'unknown error'}`
      )
    }
    clearTimeout(timeout)

    // Manual redirect follow — re-validate the Location header before the
    // next hop. Without this, a server could 302 us to a private IP.
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location')
      if (!loc) {
        throw new UrlIngestError(`Redirect ${response.status} with no Location header.`, 502)
      }
      url = new URL(loc, url)
      continue
    }

    if (!response.ok) {
      throw new UrlIngestError(`URL returned HTTP ${response.status}.`, 502)
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (
      !contentType.startsWith('text/html') &&
      !contentType.startsWith('application/xhtml') &&
      !contentType.startsWith('text/plain')
    ) {
      throw new UrlIngestError(
        `URL returned ${contentType || 'unknown content-type'}. Expected HTML.`
      )
    }
    const buf = await response.arrayBuffer()
    if (buf.byteLength > MAX_BODY_BYTES) {
      throw new UrlIngestError(
        `URL body too large (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB > 5 MB cap).`
      )
    }
    return new TextDecoder('utf-8').decode(buf)
  }
  throw new UrlIngestError(`Too many redirects (> ${MAX_REDIRECTS}).`, 502)
}

export interface UrlIngestResult {
  text: string
  source_url: string
  title?: string
}

export async function ingestUrl(input: string): Promise<UrlIngestResult> {
  const url = validateUrl(input)
  // fetchHtml validates + resolves at every hop; no need to pre-check here.
  const html = await fetchHtml(url)

  // jsdom's default console spews CSS/script errors for any real-world page;
  // suppress so the function logs stay clean.
  const virtualConsole = new VirtualConsole()
  const dom = new JSDOM(html, { url: url.toString(), virtualConsole })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()
  if (!article || !article.textContent || article.textContent.trim().length < MIN_USEFUL_CHARS) {
    throw new UrlIngestError(
      `Readability extracted < ${MIN_USEFUL_CHARS} chars of usable text from the page. ` +
        `Try a URL that points directly at resume content (a personal site, GitHub README, ` +
        `or Notion page) rather than a navigation/landing page.`
    )
  }
  return {
    text: article.textContent.trim(),
    source_url: url.toString(),
    title: article.title?.trim() ?? undefined,
  }
}

// Test exports for the SSRF guard suite.
export const __TEST__ = {
  isPrivateIpv4,
  isPrivateIpv6,
  validateUrl,
  ensurePublicHost,
}
