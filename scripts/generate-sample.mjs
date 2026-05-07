// Regenerate lib/sample/sample-report.json from a real prod resume.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   SAMPLE_RESUME_ID=<uuid> \
//   node scripts/generate-sample.mjs
//
// SAMPLE_RESUME_ID should be a real resume already analyzed in prod
// (recommended: a synthetic resume the team uploaded specifically for
// the sample). The script joins the report tables and dumps the same
// shape that lib/sample/sample-report.json expects, anonymizing the
// resume_id to a fixed sentinel.
//
// After running: review the JSON for any PII, then commit. Update the
// `_meta.generated_at` field and `_meta.source` to reflect that this
// is now real-pipeline data, not the hand-crafted M5 placeholder.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const resumeId = process.env.SAMPLE_RESUME_ID

if (!url || !key) {
  console.error(
    'Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.'
  )
  process.exit(1)
}
if (!resumeId) {
  console.error('Missing SAMPLE_RESUME_ID — set to a real resume UUID to dump.')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const outPath = join(here, '..', 'lib', 'sample', 'sample-report.json')

const supabase = createClient(url, key)

async function main() {
  console.log(`fetching prod data for resume ${resumeId}...`)

  const [
    { data: resume, error: rErr },
    { data: pd, error: pdErr },
    { data: pr, error: prErr },
    { data: queryRows, error: qErr },
  ] = await Promise.all([
    supabase
      .from('resumes')
      .select('id, file_name, target_role, target_company, created_at')
      .eq('id', resumeId)
      .single(),
    supabase.from('parse_disagreement').select('*').eq('resume_id', resumeId).single(),
    supabase
      .from('perception_reports')
      .select('apeds_features, ai_legibility_score, plain_summary, bullet_analysis')
      .eq('resume_id', resumeId)
      .single(),
    supabase
      .from('perception_query_responses')
      .select('model_name, query_key, scalar, list_value, text_value, reasoning')
      .eq('resume_id', resumeId),
  ])

  if (rErr || pdErr || prErr || qErr) {
    console.error('Fetch errors:', { rErr, pdErr, prErr, qErr })
    process.exit(1)
  }

  // Reuse consensus shaping
  const consensusList = (rows, key) => {
    const lists = rows.filter((r) => r.query_key === key && Array.isArray(r.list_value)).map((r) => r.list_value)
    if (lists.length === 0) return null
    const counts = new Map()
    const first = new Map()
    for (const list of lists)
      for (const item of list) {
        const k = item.trim().toLowerCase()
        if (!k) continue
        counts.set(k, (counts.get(k) ?? 0) + 1)
        if (!first.has(k)) first.set(k, item.trim())
      }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => first.get(k) ?? k)
  }
  const consensusText = (rows, key) => {
    const texts = rows.filter((r) => r.query_key === key && r.text_value).map((r) => r.text_value)
    if (texts.length === 0) return null
    return texts.reduce((a, b) => (a.length >= b.length ? a : b))
  }

  const out = {
    _meta: {
      generated_at: new Date().toISOString(),
      source: `regenerated from real pipeline run on resume ${resumeId} via scripts/generate-sample.mjs`,
      synthetic_resume_summary:
        'TODO: edit this to describe the synthetic resume used. resume_id has been anonymized.',
    },
    resume: {
      id: 'sample-00000000-0000-0000-0000-000000000000',
      file_name: resume.file_name,
      target_role: resume.target_role,
      target_company: resume.target_company,
      created_at: resume.created_at,
    },
    parse_disagreement: {
      field_disagreement: pd.field_disagreement,
      experience_alignment: pd.experience_alignment,
      bullet_count_variance: pd.bullet_count_variance,
      overall_score: pd.overall_score,
      parser_pair_diffs: pd.parser_pair_diffs,
    },
    perception: {
      ai_legibility_score: pr.ai_legibility_score,
      apeds_features: pr.apeds_features,
      plain_summary: pr.plain_summary,
      bullet_analysis: pr.bullet_analysis,
    },
    consensus: {
      top_strengths: consensusList(queryRows ?? [], 'top_strengths'),
      missing_signal: consensusText(queryRows ?? [], 'missing_signal'),
      key_credential: consensusText(queryRows ?? [], 'key_credential'),
    },
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n')
  console.log(`wrote ${outPath}`)
  console.log('Now: review for PII before committing.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
