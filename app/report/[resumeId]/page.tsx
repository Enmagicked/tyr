import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { LandingNav } from '@/components/landing/nav'
import { HeadlineScores } from '@/components/report/headline-scores'
import { ParserDisagreementCard } from '@/components/report/parser-disagreement-card'
import { PerceptionGrid } from '@/components/report/perception-grid'
import { InterModalDelta } from '@/components/report/inter-modal-delta'
import { ConsensusList, ConsensusText } from '@/components/report/consensus-blocks'
import { CaveatCard } from '@/components/report/caveat-card'
import type { ApedsRawFeatures } from '@/lib/agents/perception-disagreement'

interface PageProps {
  params: Promise<{ resumeId: string }>
}

interface DisagreementRow {
  field_disagreement: Record<string, number> | null
  experience_alignment: number | null
  bullet_count_variance: number | null
  overall_score: number | null
  parser_pair_diffs: Array<{
    parser_a: string
    parser_b: string
    field_disagreement: Record<string, number>
    experience_alignment: number
    bullet_count_diff: number
  }> | null
}

interface PerceptionRow {
  apeds_features: ApedsRawFeatures | null
  ai_legibility_score: number | null
  normalization_issues: { field: string; reason: string; severity: string }[] | null
}

interface PerceptionQueryRow {
  model_name: string
  query_key: string
  scalar: number | null
  list_value: string[] | null
  text_value: string | null
  reasoning: string
}

function relativeAge(createdAt: string | null): string {
  if (!createdAt) return 'just now'
  const ms = Date.now() - new Date(createdAt).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

// Modal-frequency consensus across surviving LLMs. For lists we flatten and
// pick the top-3 most-mentioned items; for text we pick the longest reasoning
// (proxy for most-detailed). Coarse but deterministic.
function consensusList(rows: PerceptionQueryRow[], queryKey: string): string[] | null {
  const lists = rows
    .filter((r) => r.query_key === queryKey && Array.isArray(r.list_value))
    .map((r) => r.list_value!)
  if (lists.length === 0) return null
  const counts = new Map<string, number>()
  for (const list of lists) {
    for (const item of list) {
      const k = item.trim().toLowerCase()
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  // Preserve original capitalization by remembering the first occurrence.
  const firstOccurrence = new Map<string, string>()
  for (const list of lists) {
    for (const item of list) {
      const k = item.trim().toLowerCase()
      if (!firstOccurrence.has(k)) firstOccurrence.set(k, item.trim())
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => firstOccurrence.get(k) ?? k)
}

function consensusText(rows: PerceptionQueryRow[], queryKey: string): string | null {
  const texts = rows
    .filter((r) => r.query_key === queryKey && r.text_value)
    .map((r) => r.text_value!)
  if (texts.length === 0) return null
  return texts.reduce((a, b) => (a.length >= b.length ? a : b))
}

export default async function ReportPage({ params }: PageProps) {
  const { resumeId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/report/${resumeId}`)

  const service = createServiceClient()

  const { data: resume } = await service
    .from('resumes')
    .select('id, file_name, candidate_id, target_role, target_company, created_at')
    .eq('id', resumeId)
    .single()

  if (!resume || resume.candidate_id !== user.id) notFound()

  const [{ data: parses }, { data: perception }, { data: disagreement }, { data: queryRows }] =
    await Promise.all([
      service.from('parse_results').select('*').eq('resume_id', resumeId),
      service
        .from('perception_reports')
        .select('apeds_features, ai_legibility_score, normalization_issues')
        .eq('resume_id', resumeId)
        .maybeSingle<PerceptionRow>(),
      service
        .from('parse_disagreement')
        .select(
          'field_disagreement, experience_alignment, bullet_count_variance, overall_score, parser_pair_diffs'
        )
        .eq('resume_id', resumeId)
        .maybeSingle<DisagreementRow>(),
      service
        .from('perception_query_responses')
        .select('model_name, query_key, scalar, list_value, text_value, reasoning')
        .eq('resume_id', resumeId)
        .returns<PerceptionQueryRow[]>(),
    ])

  const features = perception?.apeds_features ?? null
  const legibility = perception?.ai_legibility_score ?? null
  const overallParse = disagreement?.overall_score ?? null
  const agreement = overallParse === null ? null : 1 - overallParse

  const featuresMap = (features ?? {}) as Record<string, number | null>
  const interModal =
    features && features.inter_modal_delta !== undefined
      ? features.inter_modal_delta
      : null

  const queryRowsArr = queryRows ?? []
  const topStrengths = consensusList(queryRowsArr, 'top_strengths')
  const missingSignal = consensusText(queryRowsArr, 'missing_signal')

  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <div className="mx-auto max-w-5xl px-6 md:px-12 pt-32 pb-24">
        {/* Hero */}
        <section className="mb-12">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
            Your judgment
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.08] tracking-[-0.026em] mb-3">
            {resume.file_name}
          </h1>
          <p className="text-sm text-driftwood">
            Analyzed {relativeAge(resume.created_at)}
            {resume.target_role && resume.target_company
              ? ` · target: ${resume.target_role} at ${resume.target_company}`
              : ''}
          </p>
        </section>

        {/* Headline scores */}
        <section className="mb-10 animate-fade-up">
          <HeadlineScores
            scores={[
              {
                label: 'Parser agreement',
                value: agreement,
                format: 'percent',
                accent: 'sage',
                caption:
                  agreement === null
                    ? 'only one parser succeeded'
                    : `${parses?.length ?? 0} parsers`,
              },
              {
                label: 'AI-legibility',
                value: legibility,
                format: 'integer',
                accent: 'clay',
                caption:
                  legibility === null
                    ? 'no LLM signal'
                    : 'placeholder weights',
              },
              {
                label: 'Inter-modal δ',
                value: interModal,
                format: 'two-decimal',
                accent: 'marigold',
                caption: interModal === null ? '—' : 'LLM ↔ ATS',
              },
            ]}
          />
        </section>

        {/* Two-column reports */}
        <section className="grid gap-5 md:grid-cols-2 mb-10 animate-fade-up">
          <ParserDisagreementCard
            fieldDisagreement={disagreement?.field_disagreement ?? null}
            experienceAlignment={disagreement?.experience_alignment ?? null}
            parserPairDiffs={disagreement?.parser_pair_diffs ?? []}
          />
          {features ? (
            <PerceptionGrid
              features={featuresMap}
              nLLMs={features.n_llms_responding ?? 0}
            />
          ) : (
            <div className="bg-paper border border-bone border-t-[2.5px] border-t-clay rounded-[14px] p-6">
              <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-clay mb-1">
                AI interpretation
              </div>
              <div className="font-serif text-2xl text-ink mb-3">
                AI Perception Report
              </div>
              <p className="text-sm text-driftwood">
                Insufficient data — LLM judges did not respond.
              </p>
            </div>
          )}
        </section>

        {/* Inter-modal delta */}
        <section className="mb-10 animate-fade-up">
          <InterModalDelta value={interModal} />
        </section>

        {/* Consensus blocks */}
        <section className="grid gap-5 md:grid-cols-2 mb-10 animate-fade-up">
          <ConsensusList
            label="Top strengths · consensus"
            items={topStrengths}
            caveat="Across surviving LLMs, ranked by mention frequency."
          />
          <ConsensusText
            label="Missing signal · consensus"
            text={missingSignal}
            caveat="Most-detailed answer from any responding LLM."
          />
        </section>

        {/* Caveat */}
        <CaveatCard />
      </div>
    </main>
  )
}
