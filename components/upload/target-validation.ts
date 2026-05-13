// Target-form validation primitives. Pure functions — testable without DOM
// or React. The form component (target-form.tsx) consumes these for keystroke
// validation, and lib/agents/load-resume.ts uses the same `isValidTarget`
// before plumbing into the perception graph.

export interface TargetInput {
  target_role: string
  target_company: string
  // M8.B: optional job-description text. When provided, plumbs through to the
  // fit / top_strengths / missing_signal perception queries so the LLMs read
  // the resume against actual JD requirements, not just the role title.
  target_jd: string
  // M9.5: internship preset. When true, prepends an INTERNSHIP CONTEXT
  // preamble to every perception query so the recruiter persona calibrates
  // for student / new-grad funnel rather than the default senior-engineer
  // baseline.
  is_internship: boolean
}

export interface TargetValidation {
  ok: boolean
  errors: Partial<Record<keyof TargetInput, string>>
  // Trimmed, normalized values — safe to send to the API.
  normalized: TargetInput
}

const MIN = 2
const MAX = 80
// M8.B: JD soft cap. ~10K chars ≈ 2 pages dense JD text — plenty for any
// realistic posting. Above this we reject; truncating silently would mask
// part of the JD the model never sees.
export const JD_MAX = 10_000

export function validateTarget(raw: Partial<TargetInput>): TargetValidation {
  const role = (raw.target_role ?? '').trim()
  const company = (raw.target_company ?? '').trim()
  const jd = (raw.target_jd ?? '').trim()
  const errors: TargetValidation['errors'] = {}

  if (role.length < MIN) errors.target_role = 'Role must be at least 2 characters'
  else if (role.length > MAX) errors.target_role = `Role must be under ${MAX} characters`

  // Company is optional. Empty is fine; a partial entry (1 char) is not — that's
  // almost always a typo. Above MAX is always rejected.
  if (company.length > 0 && company.length < MIN)
    errors.target_company = 'Company must be at least 2 characters'
  else if (company.length > MAX)
    errors.target_company = `Company must be under ${MAX} characters`

  // M8.B: JD is optional. Empty is fine; any non-empty JD must be ≥ MIN chars
  // and ≤ JD_MAX. A 1-char JD is a typo; > JD_MAX is too long to feed every
  // model on every query without burning the context budget.
  if (jd.length > 0 && jd.length < MIN)
    errors.target_jd = 'Job description must be at least 2 characters'
  else if (jd.length > JD_MAX)
    errors.target_jd = `Job description must be under ${JD_MAX.toLocaleString()} characters`

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    normalized: {
      target_role: role,
      target_company: company,
      target_jd: jd,
      is_internship: !!raw.is_internship,
    },
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
