import { GraphNode } from '@/lib/graph'
import { loadResume } from './load-resume'
// parseAffinda intentionally not imported — dropped from the runtime rotation
// in M7 (see graph definition below for context + re-enable instructions).
import { parseOpenResume, parseNaive, synthesizeParse } from './parsers'
import { parseWithLlm } from './parse-llm'
import {
  perceiveGPT4o,
  perceiveClaude,
  perceiveGemini,
  perceiveLlama,
  synthesizePerception,
} from './llm'
import { computeDisagreement } from './compute-disagreement'
import { computePerceptionDisagreementNode } from './compute-perception-disagreement'
import { analyzeBullets } from './analyze-bullets'
import { synthesizeSummary } from './synthesize-summary'
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
    // M7 (KNOWN_ISSUES 2.2): Affinda silently returned parse_score: 0.0 on
    // every prod resume — `scoreAndIssues` reaches 0 only when ALL fields
    // (name/email/phone/skills/experience/education) are empty in the
    // mapped output, which means Affinda's v3 response shape no longer
    // matches AffindaDocument in lib/parsers/affinda.ts (likely the trial-
    // tier workspace returns a different document type).
    //
    // Dropped from the runtime rotation. The disagreement scorer in
    // lib/agents/disagreement.ts handles 2 parsers cleanly (M2 acceptance
    // criterion 5). lib/parsers/affinda.ts stays as a dormant integration —
    // to re-enable: add console.log(raw) to parseWithAffinda, run one
    // upload, compare the response keys against AffindaDocument, fix the
    // mapping, then re-add the node here.
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
    // M9.5: Claude-Haiku-backed parser — high-quality canonical_data
    // anchor. Captures projects + activities + awards (which the legacy
    // parsers don't touch) and reliably extracts bullets so
    // analyze_bullets has a source even when openresume fails on the
    // user's layout.
    {
      name: 'parse_llm',
      fn: parseWithLlm,
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
      // M7: parse_affinda removed — see comment above. Re-add here when the
      // Affinda response-shape mapping is fixed.
      optional_deps: ['parse_openresume', 'parse_naive', 'parse_llm'],
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
    // --- M5: bullet-level analysis over the highest-score canonical parse ---
    {
      name: 'analyze_bullets',
      fn: analyzeBullets,
      optional_deps: ['parse_resume'],
    },
    // --- M5: plain-English summary (one Claude call after disagreement+bullets) ---
    {
      name: 'synthesize_summary',
      fn: synthesizeSummary,
      optional_deps: [
        'compute_disagreement',
        'compute_perception_disagreement',
        'analyze_bullets',
      ],
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
        'analyze_bullets',
        'synthesize_summary',
      ],
    },
  ]
}
