import { GraphNode } from '@/lib/graph'
import { loadResume } from './load-resume'
import { parseAffinda, parseOpenResume, parseNaive, synthesizeParse } from './parsers'
import {
  perceiveGPT4o,
  perceiveClaude,
  perceiveGemini,
  perceiveLlama,
  synthesizePerception,
} from './llm'
import { computeDisagreement } from './compute-disagreement'
import { computePerceptionDisagreementNode } from './compute-perception-disagreement'
import { saveResults } from './save-results'

// The full analysis graph. Adding a new signal source = adding a new node here.
// Dependency rules:
//   depends_on  — hard: if the dep fails, this node is skipped entirely
//   optional_deps — soft: this node waits for the dep to finish, succeeds or not
//
// The aggregate nodes parse_resume / perceive_resume list all their data-source
// nodes as optional_deps so they run on whatever subset succeeded — a missing
// API key never kills the whole run.
export function buildAnalysisGraph(): GraphNode[] {
  return [
    {
      name: 'load_resume',
      fn: loadResume,
    },
    // --- ATS parsers (parallel) ---
    {
      name: 'parse_affinda',
      fn: parseAffinda,
      depends_on: ['load_resume'],
    },
    {
      name: 'parse_openresume',
      fn: parseOpenResume,
      depends_on: ['load_resume'],
    },
    {
      name: 'parse_naive',
      fn: parseNaive,
      depends_on: ['load_resume'],
    },
    // --- LLM perception (parallel) ---
    {
      name: 'perceive_gpt4o',
      fn: perceiveGPT4o,
      depends_on: ['load_resume'],
    },
    {
      name: 'perceive_claude',
      fn: perceiveClaude,
      depends_on: ['load_resume'],
    },
    {
      name: 'perceive_gemini',
      fn: perceiveGemini,
      depends_on: ['load_resume'],
    },
    {
      name: 'perceive_llama',
      fn: perceiveLlama,
      depends_on: ['load_resume'],
    },
    // --- Aggregates (wait for all parsers/models, accept partial results) ---
    {
      name: 'parse_resume',
      fn: synthesizeParse,
      depends_on: ['load_resume'],
      optional_deps: ['parse_affinda', 'parse_openresume', 'parse_naive'],
    },
    {
      name: 'perceive_resume',
      fn: synthesizePerception,
      depends_on: ['load_resume'],
      optional_deps: ['perceive_gpt4o', 'perceive_claude', 'perceive_gemini', 'perceive_llama'],
    },
    // --- M2: cross-parser disagreement (runs after parse_resume aggregates) ---
    {
      name: 'compute_disagreement',
      fn: computeDisagreement,
      optional_deps: ['parse_resume'],
    },
    // --- M3: cross-LLM disagreement (needs both halves: parse + perceive) ---
    {
      name: 'compute_perception_disagreement',
      fn: computePerceptionDisagreementNode,
      optional_deps: ['perceive_resume', 'compute_disagreement'],
    },
    // --- Persistence (runs last, fails gracefully if Supabase not configured) ---
    {
      name: 'save_results',
      fn: saveResults,
      optional_deps: [
        'parse_resume',
        'perceive_resume',
        'compute_disagreement',
        'compute_perception_disagreement',
      ],
    },
  ]
}
