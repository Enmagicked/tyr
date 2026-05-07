// Public /sample route — no auth gate. Renders the same report components
// against a hand-crafted synthetic fixture so visitors can see how tyr
// works without uploading.
//
// To regenerate the fixture from a real pipeline run, see
// scripts/generate-sample.mjs.

import Link from 'next/link'
import { LandingNav } from '@/components/landing/nav'
import { HeadlineScores } from '@/components/report/headline-scores'
import { ParserDisagreementCard } from '@/components/report/parser-disagreement-card'
import { PerceptionGrid } from '@/components/report/perception-grid'
import { InterModalDelta } from '@/components/report/inter-modal-delta'
import { ConsensusList, ConsensusText } from '@/components/report/consensus-blocks'
import { CaveatCard } from '@/components/report/caveat-card'
import { PlainSummarySection } from '@/components/report/plain-summary'
import sampleData from '@/lib/sample/sample-report.json'

export const metadata = {
  title: 'Sample report — tyr',
}

interface SampleData {
  resume: {
    file_name: string
    target_role: string
    target_company: string
  }
  parse_disagreement: {
    field_disagreement: Record<string, number>
    experience_alignment: number | null
    overall_score: number | null
    parser_pair_diffs: Array<{
      parser_a: string
      parser_b: string
      field_disagreement: Record<string, number>
      experience_alignment: number
      bullet_count_diff: number
    }>
  }
  perception: {
    ai_legibility_score: number
    apeds_features: Record<string, number | null>
    plain_summary: {
      ats_paragraph: string
      experience_paragraph: string
      ai_consensus_paragraph: string
      recommendations: string[]
    }
  }
  consensus: {
    top_strengths: string[]
    missing_signal: string
  }
}

export default function SamplePage() {
  const data = sampleData as unknown as SampleData
  const overall = data.parse_disagreement.overall_score
  const agreement = overall === null ? null : 1 - overall
  const features = data.perception.apeds_features
  const interModal = (features.inter_modal_delta as number | null) ?? null

  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <div className="mx-auto max-w-5xl px-6 md:px-12 pt-32 pb-24">
        {/* Sample banner */}
        <div className="bg-thistle/10 border border-thistle/30 rounded-[14px] p-5 mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-thistle mb-1">
              Sample report
            </p>
            <p className="text-sm text-ink leading-[1.65]">
              This is a synthetic resume — not real data. Your own report will
              be customized to your actual resume and target.
            </p>
          </div>
          <Link
            href="/upload"
            className="text-[13px] font-medium px-5 py-2 rounded-full bg-ink text-vellum hover:bg-ink/90 transition-colors flex-shrink-0"
          >
            Upload yours →
          </Link>
        </div>

        {/* Hero */}
        <section className="mb-12">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
            Your judgment
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.08] tracking-[-0.026em] mb-3">
            {data.resume.file_name}
          </h1>
          <p className="text-sm text-driftwood">
            target: {data.resume.target_role} at {data.resume.target_company}
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
                caption: '3 parsers',
              },
              {
                label: 'AI-legibility',
                value: data.perception.ai_legibility_score,
                format: 'integer',
                accent: 'clay',
                caption: 'placeholder weights',
              },
              {
                label: 'Inter-modal δ',
                value: interModal,
                format: 'two-decimal',
                accent: 'marigold',
                caption: 'LLM ↔ ATS',
              },
            ]}
          />
        </section>

        {/* Two-column reports */}
        <section className="grid gap-5 md:grid-cols-2 mb-10 animate-fade-up">
          <ParserDisagreementCard
            fieldDisagreement={data.parse_disagreement.field_disagreement}
            experienceAlignment={data.parse_disagreement.experience_alignment}
            parserPairDiffs={data.parse_disagreement.parser_pair_diffs}
          />
          <PerceptionGrid
            features={features}
            nLLMs={(features.n_llms_responding as number) ?? 4}
          />
        </section>

        <section className="mb-10 animate-fade-up">
          <InterModalDelta value={interModal} />
        </section>

        <section className="grid gap-5 md:grid-cols-2 mb-10 animate-fade-up">
          <ConsensusList
            label="Top strengths · consensus"
            items={data.consensus.top_strengths}
            caveat="Across surviving LLMs, ranked by mention frequency."
          />
          <ConsensusText
            label="Missing signal · consensus"
            text={data.consensus.missing_signal}
            caveat="Most-detailed answer from any responding LLM."
          />
        </section>

        <section className="mb-10 animate-fade-up">
          <PlainSummarySection summary={data.perception.plain_summary} />
        </section>

        <CaveatCard />
      </div>
    </main>
  )
}
