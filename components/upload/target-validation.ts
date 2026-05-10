// Target-form validation primitives. Pure functions — testable without DOM
// or React. The form component (target-form.tsx) consumes these for keystroke
// validation, and lib/agents/load-resume.ts uses the same `isValidTarget`
// before plumbing into the perception graph.

export interface TargetInput {
  target_role: string
  target_company: string
}

export interface TargetValidation {
  ok: boolean
  errors: Partial<Record<keyof TargetInput, string>>
  // Trimmed, normalized values — safe to send to the API.
  normalized: TargetInput
}

const MIN = 2
const MAX = 80

export function validateTarget(raw: Partial<TargetInput>): TargetValidation {
  const role = (raw.target_role ?? '').trim()
  const company = (raw.target_company ?? '').trim()
  const errors: TargetValidation['errors'] = {}

  if (role.length < MIN) errors.target_role = 'Role must be at least 2 characters'
  else if (role.length > MAX) errors.target_role = `Role must be under ${MAX} characters`

  // Company is optional. Empty is fine; a partial entry (1 char) is not — that's
  // almost always a typo. Above MAX is always rejected.
  if (company.length > 0 && company.length < MIN)
    errors.target_company = 'Company must be at least 2 characters'
  else if (company.length > MAX)
    errors.target_company = `Company must be under ${MAX} characters`

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    normalized: { target_role: role, target_company: company },
  }
}

export function isValidTarget(raw: Partial<TargetInput>): boolean {
  return validateTarget(raw).ok
}

// A handful of common roles for the dropdown. Users can also type freeform —
// validation only checks min/max length, not membership. Order = relevance to
// the candidate population we expect on /upload.
export const COMMON_ROLES = [
  'Software Engineer',
  'Senior Software Engineer',
  'Staff Software Engineer',
  'Backend Engineer',
  'Frontend Engineer',
  'Full-Stack Engineer',
  'ML Engineer',
  'Data Scientist',
  'Data Engineer',
  'Product Manager',
  'Senior Product Manager',
  'Designer',
  'Investment Banking Analyst',
  'Investment Banking Associate',
  'Management Consultant',
  'Hedge Fund Analyst',
  'Quantitative Researcher',
  'Other',
] as const
