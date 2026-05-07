import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { LandingNav } from '@/components/landing/nav'
import { AccountActions } from '@/components/account/account-actions'

export const metadata = {
  title: 'Account — tyr',
}

function relativeAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime()
  const day = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (day < 1) return 'today'
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month} month${month === 1 ? '' : 's'} ago`
  const year = Math.floor(day / 365)
  return `${year} year${year === 1 ? '' : 's'} ago`
}

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account')

  const service = createServiceClient()

  const { count: reportCount } = await service
    .from('resumes')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', user.id)

  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <div className="mx-auto max-w-2xl px-6 md:px-12 pt-32 pb-24">
        <div className="mb-10">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
            Account
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.08] tracking-[-0.026em]">
            Your account
          </h1>
        </div>

        <div className="bg-paper border border-bone rounded-[14px] p-6 mb-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8 text-sm">
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-1">
                Email
              </dt>
              <dd className="text-ink break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-1">
                Member since
              </dt>
              <dd className="text-ink">{relativeAge(user.created_at)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-1">
                Reports
              </dt>
              <dd className="text-ink">{reportCount ?? 0} uploaded</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-1">
                User ID
              </dt>
              <dd className="text-ink font-mono text-xs break-all">
                {user.id}
              </dd>
            </div>
          </dl>
        </div>

        <AccountActions email={user.email ?? ''} />
      </div>
    </main>
  )
}
