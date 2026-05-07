import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { LandingNav } from '@/components/landing/nav'
import { ReportRow, type ReportRowData } from '@/components/report/report-row'

export const metadata = {
  title: 'My reports — tyr',
}

interface ResumeRow {
  id: string
  file_name: string
  target_role: string | null
  target_company: string | null
  created_at: string
}

interface DisagreementRow {
  resume_id: string
  overall_score: number | null
}

interface PerceptionRow {
  resume_id: string
  ai_legibility_score: number | null
}

export default async function ReportsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/reports')

  const service = createServiceClient()

  // Pull in three queries in parallel and join client-side. Cheaper than a
  // Postgres join through PostgREST and keeps the queries readable.
  const { data: resumes } = await service
    .from('resumes')
    .select('id, file_name, target_role, target_company, created_at')
    .eq('candidate_id', user.id)
    .order('created_at', { ascending: false })
    .returns<ResumeRow[]>()

  const resumeIds = (resumes ?? []).map((r) => r.id)
  const [{ data: disagreements }, { data: perceptions }] = await Promise.all([
    resumeIds.length > 0
      ? service
          .from('parse_disagreement')
          .select('resume_id, overall_score')
          .in('resume_id', resumeIds)
          .returns<DisagreementRow[]>()
      : Promise.resolve({ data: [] as DisagreementRow[] }),
    resumeIds.length > 0
      ? service
          .from('perception_reports')
          .select('resume_id, ai_legibility_score')
          .in('resume_id', resumeIds)
          .returns<PerceptionRow[]>()
      : Promise.resolve({ data: [] as PerceptionRow[] }),
  ])

  const disagreementMap = new Map(
    (disagreements ?? []).map((d) => [d.resume_id, d.overall_score])
  )
  const perceptionMap = new Map(
    (perceptions ?? []).map((p) => [p.resume_id, p.ai_legibility_score])
  )

  const rows: ReportRowData[] = (resumes ?? []).map((r) => {
    const overall = disagreementMap.get(r.id) ?? null
    return {
      id: r.id,
      file_name: r.file_name,
      target_role: r.target_role,
      target_company: r.target_company,
      created_at: r.created_at,
      parser_agreement: overall === null ? null : 1 - overall,
      ai_legibility: perceptionMap.get(r.id) ?? null,
    }
  })

  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <div className="mx-auto max-w-3xl px-6 md:px-12 pt-32 pb-24">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
              Your uploads
            </p>
            <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.08] tracking-[-0.026em]">
              My reports
            </h1>
          </div>
          <Link
            href="/upload"
            className="text-[13px] font-medium px-5 py-2 rounded-full bg-ink text-vellum hover:bg-ink/90 transition-colors flex-shrink-0"
          >
            New upload →
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="bg-paper border border-bone rounded-[14px] p-12 text-center">
            <p className="font-serif text-2xl text-ink mb-2">
              No reports yet
            </p>
            <p className="text-sm text-driftwood mb-6">
              Upload a resume and tyr will run it through 3 ATS parsers and 4
              frontier LLMs in parallel.
            </p>
            <Link
              href="/upload"
              className="inline-block text-sm font-medium px-5 py-2 rounded-full bg-ink text-vellum hover:bg-ink/90 transition-colors"
            >
              Upload your first resume →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <ReportRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
