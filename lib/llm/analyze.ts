import { LLMResponse, ModelName, PerceptionReport } from '@/types'
import { MODELS } from './index'

// Generates a PerceptionReport from raw LLM responses without any additional API calls.
// Groups by prompt_key, extracts structured data with simple patterns, finds divergences.

function groupByPromptAndModel(responses: LLMResponse[]): Record<string, Record<string, string>> {
  const grouped: Record<string, Record<string, string>> = {}
  for (const r of responses) {
    if (!grouped[r.prompt_key]) grouped[r.prompt_key] = {}
    grouped[r.prompt_key][r.model_name] = r.response_text
  }
  return grouped
}

function extractNumberedList(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => /^\d+[.)]\s+/.test(l.trim()))
    .map((l) => l.replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean)
}

function extractSeniority(text: string): string {
  const levels = ['intern', 'entry-level', 'entry level', 'mid-level', 'mid level', 'senior', 'staff', 'principal', 'director', 'vp', 'c-level']
  const lower = text.toLowerCase()
  return levels.find((l) => lower.includes(l)) ?? 'unknown'
}

function findConsensusList(lists: string[][]): string[] {
  if (lists.length === 0) return []
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  return lists[0].filter((item) => {
    const n = normalize(item)
    return lists.every((list) => list.some((other) => normalize(other).includes(n) || n.includes(normalize(other))))
  })
}

export function generatePerceptionReport(resumeId: string, responses: LLMResponse[]): PerceptionReport {
  const grouped = groupByPromptAndModel(responses)

  const seniorityByModel = {} as Record<ModelName, string>
  const rolesByModel = {} as Record<ModelName, string[]>
  const skillsByModel = {} as Record<ModelName, string[]>
  const gapsByModel = {} as Record<ModelName, string[]>
  const descriptionByModel = {} as Record<ModelName, string>
  const recruiterTakeByModel = {} as Record<ModelName, string>

  for (const model of MODELS) {
    seniorityByModel[model] = extractSeniority(grouped['seniority']?.[model] ?? '')
    rolesByModel[model] = extractNumberedList(grouped['roles']?.[model] ?? '')
    skillsByModel[model] = extractNumberedList(grouped['skills']?.[model] ?? '')
    gapsByModel[model] = grouped['gaps']?.[model]
      ? grouped['gaps'][model].split('\n').filter((l) => l.trim().length > 20).slice(0, 3)
      : []
    descriptionByModel[model] = grouped['describe']?.[model] ?? ''
    recruiterTakeByModel[model] = grouped['recruiter_take']?.[model] ?? ''
  }

  const uniqueSeniorities = new Set(Object.values(seniorityByModel).filter((s) => s !== 'unknown'))
  const divergentSeniority = uniqueSeniorities.size > 1

  const consensusSkills = findConsensusList(Object.values(skillsByModel))

  const allGaps = [...new Set(Object.values(gapsByModel).flat().filter(Boolean))]

  return {
    resume_id: resumeId,
    description_by_model: descriptionByModel,
    roles_by_model: rolesByModel,
    seniority_by_model: seniorityByModel,
    skills_by_model: skillsByModel,
    gaps_by_model: gapsByModel,
    recruiter_take_by_model: recruiterTakeByModel,
    consensus_skills: consensusSkills,
    divergent_seniority: divergentSeniority,
    seniority_note: divergentSeniority
      ? `Models disagree on seniority: ${Object.entries(seniorityByModel).map(([m, s]) => `${m} → ${s}`).join(', ')}`
      : undefined,
    top_recommendations: allGaps.slice(0, 5),
  }
}
