// Canonical resume types — produced by lib/parsers/normalize.ts after each
// parser's raw output is normalized. These are the inputs that
// lib/agents/disagreement.ts compares across parsers.

export type CanonicalContact = {
  email?: string
  phone?: string
  linkedin_url?: string
  github_url?: string
  personal_urls: string[] // any other http(s) URL — portfolio, scholar, etc.
}

export type DegreeNormalized =
  | 'BS'
  | 'BA'
  | 'MS'
  | 'MA'
  | 'MBA'
  | 'PhD'
  | 'JD'
  | 'MD'
  | 'other'

export type CanonicalEducation = {
  school_canonical_id: string // see normalizer
  school_raw: string
  degree_normalized?: DegreeNormalized
  field?: string
  start_iso?: string // YYYY-MM
  end_iso?: string // YYYY-MM or undefined if current
  gpa?: number
}

export type LevelInferred =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'lead'
  | 'exec'

export type CanonicalExperience = {
  employer_canonical_id: string
  employer_raw: string
  title_raw: string
  level_inferred?: LevelInferred
  start_iso?: string
  end_iso?: string // undefined if current
  bullets: string[] // split on \n / • / - / numbered / sentence
  bullet_count: number
  char_count: number
}

export type CanonicalSkill = {
  name_canonical: string
  source: 'self' | 'inferred'
  weight?: number
}

export type CanonicalResume = {
  name?: string
  contact: CanonicalContact
  education: CanonicalEducation[]
  experience: CanonicalExperience[]
  skills: CanonicalSkill[]
}

export type NormalizationIssue = {
  field: string
  reason: string
  raw_value?: string
  severity: 'low' | 'medium' | 'high'
}
