import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { LandingNav } from '@/components/landing/nav'
import { BuilderPreview } from '@/components/builder/builder-preview'
import type { GeneratedResume } from '@/lib/builder/types'
import type { ApedsRawFeatures } from '@/lib/agents/perception-disagreement'

interface PageProps {
  params: Promise<{ resumeId: string }>
}

export default async function BuilderReviewPage({ params }: PageProps) {
  const { resumeId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/builder/${resumeId}`)

  const service = createServiceClient()
  const { data: resume } = await service
    .from('resumes')
    .select(
      'id, candidate_id, input_kind, builder_input, builder_rewrites_used, target_role, target_jd, is_internship'
    )
    .eq('id', resumeId)
    .single()
  if (!resume || resume.candidate_id !== user.id) notFound()
  if (resume.input_kind !== 'builder') {
    redirect(`/report/${resumeId}`)
  }

  const builderBlob = (resume.builder_input as { generated?: GeneratedResume } | null) ?? {}
  const generated = builderBlob.generated
  if (!generated) notFound()

  const { data: perception } = await service
    .from('perception_reports')
    .select('apeds_features')
    .eq('resume_id', resumeId)
    .maybeSingle()

  const features = (perception?.apeds_features as ApedsRawFeatures | null) ?? null

  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <div className="mx-auto max-w-5xl px-6 pt-32 pb-24 md:px-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-2">
              Your generated resume
            </p>
            <h1 className="font-serif text-3xl md:text-4xl text-ink leading-[1.08] tracking-[-0.026em]">
              {generated.name}
            </h1>
            {resume.target_role && (
              <p className="mt-2 text-driftwood text-sm">
                Target: {resume.target_role as string}
                {resume.is_internship ? ' · internship' : ''}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <Link
              href={`/report/${resumeId}`}
              className="rounded-full border border-bone bg-vellum/50 px-4 py-2 text-[13px] font-medium text-ink hover:bg-bone transition-colors"
            >
              View full analysis →
            </Link>
          </div>
        </div>

        {features && (
          <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-3">
            <ScoreCard label="Seniority" value={features.mean_seniority} max={10} />
            <ScoreCard label="Technical depth" value={features.mean_technical_depth} max={10} />
            <ScoreCard label="Fit" value={features.mean_fit} max={10} />
            <ScoreCard
              label="Final-round odds"
              value={features.mean_final_round_prob ? features.mean_final_round_prob * 100 : null}
              unit="%"
              digits={0}
            />
          </div>
        )}

        <BuilderPreview
          resumeId={resumeId}
          initialGenerated={generated}
          rewritesUsed={resume.builder_rewrites_used as number}
        />
      </div>
    </main>
  )
}

function ScoreCard({
  label,
  value,
  max,
  unit,
  digits = 1,
}: {
  label: string
  value: number | null
  max?: number
  unit?: string
  digits?: number
}) {
  const display =
    value === null || value === undefined || Number.isNaN(Number(value))
      ? '—'
      : Number(value).toFixed(digits)
  return (
    <div className="rounded-xl border border-bone bg-paper p-4">
      <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-driftwood mb-1.5">
        {label}
      </p>
      <p className="font-serif text-2xl text-ink">
        {display}
        {max && <span className="text-driftwood/60 text-base">/{max}</span>}
        {unit && <span className="text-driftwood/60 text-base">{unit}</span>}
      </p>
    </div>
  )
}
