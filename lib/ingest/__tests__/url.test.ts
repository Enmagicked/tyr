// SSRF guard tests for the M8.C URL ingest path. The fetch + Readability
// path itself isn't unit-tested here (it'd need a fixture HTTP server) —
// it's covered by the M8 prod smoke test. What's load-bearing is that the
// validation rules CANNOT be tricked into letting through a private-IP or
// non-http URL, so this file exhausts the relevant cases.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { __TEST__, validateUrl, UrlIngestError, ingestUrl } from '../url.ts'

const { isPrivateIpv4, isPrivateIpv6, ensurePublicHost } = __TEST__

// ---------------------------------------------------------------------------
// IPv4 private-range matcher
// ---------------------------------------------------------------------------

test('isPrivateIpv4: 10/8 loopback + RFC1918', () => {
  assert.equal(isPrivateIpv4('10.0.0.1'), true)
  assert.equal(isPrivateIpv4('10.255.255.255'), true)
  assert.equal(isPrivateIpv4('192.168.1.1'), true)
  assert.equal(isPrivateIpv4('172.16.0.1'), true)
  assert.equal(isPrivateIpv4('172.31.255.255'), true)
  // 172.32 is NOT private
  assert.equal(isPrivateIpv4('172.32.0.1'), false)
})

test('isPrivateIpv4: loopback', () => {
  assert.equal(isPrivateIpv4('127.0.0.1'), true)
  assert.equal(isPrivateIpv4('127.255.255.255'), true)
})

test('isPrivateIpv4: AWS metadata + link-local', () => {
  assert.equal(isPrivateIpv4('169.254.169.254'), true) // the famous one
  assert.equal(isPrivateIpv4('169.254.0.1'), true)
})

test('isPrivateIpv4: 0.0.0.0 + multicast + broadcast', () => {
  assert.equal(isPrivateIpv4('0.0.0.0'), true)
  assert.equal(isPrivateIpv4('224.0.0.1'), true)
  assert.equal(isPrivateIpv4('239.255.255.255'), true)
  assert.equal(isPrivateIpv4('255.255.255.255'), true)
})

test('isPrivateIpv4: documentation ranges', () => {
  assert.equal(isPrivateIpv4('192.0.2.1'), true)
  assert.equal(isPrivateIpv4('198.51.100.1'), true)
  assert.equal(isPrivateIpv4('203.0.113.1'), true)
})

test('isPrivateIpv4: CGNAT 100.64/10', () => {
  assert.equal(isPrivateIpv4('100.64.0.1'), true)
  assert.equal(isPrivateIpv4('100.127.255.255'), true)
  // 100.63 is NOT in CGNAT
  assert.equal(isPrivateIpv4('100.63.0.1'), false)
})

test('isPrivateIpv4: public IPs pass through', () => {
  assert.equal(isPrivateIpv4('8.8.8.8'), false)
  assert.equal(isPrivateIpv4('1.1.1.1'), false)
  assert.equal(isPrivateIpv4('151.101.1.1'), false)
})

// ---------------------------------------------------------------------------
// IPv6 private-range matcher
// ---------------------------------------------------------------------------

test('isPrivateIpv6: loopback + unspecified', () => {
  assert.equal(isPrivateIpv6('::1'), true)
  assert.equal(isPrivateIpv6('::'), true)
})

test('isPrivateIpv6: link-local fe80::', () => {
  assert.equal(isPrivateIpv6('fe80::1'), true)
})

test('isPrivateIpv6: unique-local fc00::/7', () => {
  assert.equal(isPrivateIpv6('fc00::1'), true)
  assert.equal(isPrivateIpv6('fd12:3456:789a::1'), true)
})

test('isPrivateIpv6: IPv4-mapped IPv6 with private inner IPv4', () => {
  assert.equal(isPrivateIpv6('::ffff:127.0.0.1'), true)
  assert.equal(isPrivateIpv6('::ffff:169.254.169.254'), true)
})

test('isPrivateIpv6: public IPv6 passes through', () => {
  assert.equal(isPrivateIpv6('2001:4860:4860::8888'), false)
  assert.equal(isPrivateIpv6('2606:4700:4700::1111'), false)
})

// ---------------------------------------------------------------------------
// validateUrl — string-pattern gate
// ---------------------------------------------------------------------------

test('validateUrl: rejects malformed URL', () => {
  assert.throws(() => validateUrl('not-a-url'), UrlIngestError)
  assert.throws(() => validateUrl(''), UrlIngestError)
})

test('validateUrl: rejects file://, ftp://, gopher://, javascript:', () => {
  assert.throws(() => validateUrl('file:///etc/passwd'), UrlIngestError)
  assert.throws(() => validateUrl('ftp://example.com/'), UrlIngestError)
  assert.throws(() => validateUrl('gopher://example.com/'), UrlIngestError)
  assert.throws(() => validateUrl('javascript:alert(1)'), UrlIngestError)
})

test('validateUrl: rejects URLs with embedded credentials', () => {
  assert.throws(
    () => validateUrl('https://user:pass@example.com/'),
    UrlIngestError
  )
})

test('validateUrl: rejects localhost variants before DNS', () => {
  assert.throws(() => validateUrl('http://localhost/'), UrlIngestError)
  assert.throws(() => validateUrl('http://LOCALHOST:3000/'), UrlIngestError)
  assert.throws(() => validateUrl('http://app.localhost/'), UrlIngestError)
  assert.throws(
    () => validateUrl('http://metadata.google.internal/computeMetadata/v1/'),
    UrlIngestError
  )
})

test('validateUrl: accepts plain http and https', () => {
  assert.doesNotThrow(() => validateUrl('https://example.com/'))
  assert.doesNotThrow(() => validateUrl('http://example.com/'))
  assert.doesNotThrow(() => validateUrl('https://my.site.com/path?query=1'))
})

// ---------------------------------------------------------------------------
// ensurePublicHost — IP-literal cases (DNS lookups happen for hostnames; we
// don't fixture a DNS server here, so only the literal-IP branches are
// exhaustively tested. Hostname resolution coverage lives in the prod smoke
// test.)
// ---------------------------------------------------------------------------

test('ensurePublicHost: rejects literal private IPv4', async () => {
  await assert.rejects(() => ensurePublicHost('127.0.0.1'), UrlIngestError)
  await assert.rejects(() => ensurePublicHost('10.0.0.1'), UrlIngestError)
  await assert.rejects(() => ensurePublicHost('169.254.169.254'), UrlIngestError)
  await assert.rejects(() => ensurePublicHost('192.168.1.1'), UrlIngestError)
})

test('ensurePublicHost: passes literal public IPv4', async () => {
  await assert.doesNotReject(() => ensurePublicHost('8.8.8.8'))
})

// ---------------------------------------------------------------------------
// Integration smoke: ingestUrl rejects scheme/credentials/localhost end-to-end
// ---------------------------------------------------------------------------

test('ingestUrl: rejects non-http schemes', async () => {
  await assert.rejects(() => ingestUrl('file:///etc/passwd'), UrlIngestError)
  await assert.rejects(() => ingestUrl('javascript:alert(1)'), UrlIngestError)
})

test('ingestUrl: rejects private IP literals', async () => {
  await assert.rejects(() => ingestUrl('http://127.0.0.1/'), UrlIngestError)
  await assert.rejects(
    () => ingestUrl('http://169.254.169.254/latest/meta-data/'),
    UrlIngestError
  )
  await assert.rejects(() => ingestUrl('http://10.0.0.1/'), UrlIngestError)
})

test('ingestUrl: rejects localhost variants', async () => {
  await assert.rejects(() => ingestUrl('http://localhost:3000/'), UrlIngestError)
  await assert.rejects(() => ingestUrl('http://app.localhost/'), UrlIngestError)
})
