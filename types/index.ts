import type { CanonicalResume, NormalizationIssue } from './resume'

export type { CanonicalResume, NormalizationIssue } from './resume'
export type {
  CanonicalContact,
  CanonicalEducation,
  CanonicalExperience,
  CanonicalSkill,
  DegreeNormalized,
  LevelInferred,
} from './resume'

export type ParserName = 'affinda' | 'openresume' | 'naive' | 'llm'
export type ModelName =
  | 'gpt-4o'
  | 'claude-sonnet-4-6'
  | 'gemini-2.5-flash'
  | 'llama-3.3-70b'
export type PromptKey = 'describe' | 'roles' | 'seniority' | 'skills' | 'gaps' | 'recruiter_take'

export interface WorkExperience {
  title?: string
  company?: string
  start_date?: string
  end_date?: string
  is_current?: boolean
  description?: string
}

export interface Education {
  degree?: string
  institution?: string
  field?: string
  graduation_date?: string
  gpa?: string
}

export interface ParseIssue {
  field: string
  issue: string
  severity: 'low' | 'medium' | 'high'
}

export interface ParsedResume {
  name?: string
  email?: string
  phone?: string
  location?: string
  linkedin?: string
  summary?: string
  skills: string[]
  experience: WorkExperience[]
  education: Education[]
  certifications: string[]
  languages: string[]
}

export interface ParseResult {
  parser_name: ParserName
  raw_output: unknown
  structured_data: ParsedResume
  // M2: canonical_data is the normalized output used for cross-parser disagreement.
  // Populated by lib/parsers/normalize.ts. Always present (empty canonical resume
  // when normalization had nothing to work with).
  canonical_data: CanonicalResume
  normalization_issues: NormalizationIssue[]
  parse_score: number
  issues: ParseIssue[]
}

export interface LLMResponse {
  model_name: ModelName
  prompt_key: PromptKey
  response_text: string
  latency_ms: number
}

export interface PerceptionReport {
  resume_id: string
  description_by_model: Record<ModelName, string>
  roles_by_model: Record<ModelName, string[]>
  seniority_by_model: Record<ModelName, string>
  skills_by_model: Record<ModelName, string[]>
  gaps_by_model: Record<ModelName, string[]>
  recruiter_take_by_model: Record<ModelName, string>
  consensus_skills: string[]
  divergent_seniority: boolean
  seniority_note?: string
  top_recommendations: string[]
}

export interface Candidate {
  id: string
  email: string
  full_name?: string
  linkedin_url?: string
  created_at: string
}

export interface Resume {
  id: string
  candidate_id: string
  file_path: string
  file_name: string
  raw_text?: string
  created_at: string
}
