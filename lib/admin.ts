// Admin / staff account bypass. Emails listed in the ADMIN_EMAILS env var
// (comma-separated, case-insensitive) skip paywall gates: no credit
// requirement, no decrement on use, no builder-locked check, no per-draft
// rewrite cap. Used to QA the product end-to-end without burning real
// dollars.
//
// Set in Vercel: ADMIN_EMAILS=alice@example.com,bob@example.com
//
// Deliberately silent — no UI badge, no special routing, no logs that
// expose the list to non-admin users. Treat as a non-secret-but-quiet
// list (anyone with Vercel access can read it; that's fine).

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter((s) => s.length > 0)

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
