import { LandingNav } from '@/components/landing/nav'
import { Footer } from '@/components/landing/footer'

export const metadata = {
  title: 'Privacy — tyr',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <article className="mx-auto max-w-2xl px-6 pt-32 pb-24 md:px-12">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
          Legal
        </p>
        <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.08] tracking-[-0.026em] mb-8">
          Privacy
        </h1>
        <p className="text-driftwood mb-10 leading-relaxed">
          Last updated: 2026-05-14. tyr is operated as an independent service. This
          policy explains what we collect, why, and how to delete your data.
        </p>

        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <b>Account info:</b> email address (via Supabase Auth) and a hashed
              password. We never see your password.
            </li>
            <li>
              <b>Your resume content:</b> the file you upload (PDF / image / URL
              text) and the extracted plain text. Stored privately in our
              Supabase Storage bucket, keyed to your account.
            </li>
            <li>
              <b>AI analysis results:</b> the per-model scores and reasoning
              generated when we analyze your resume. Stored against your
              account so you can revisit reports.
            </li>
            <li>
              <b>Builder inputs:</b> if you use the Activities Builder, the
              structured form data you submit is stored alongside the generated
              resume.
            </li>
            <li>
              <b>Payment info:</b> handled entirely by Stripe — we receive a
              Stripe customer ID and the fact that a checkout completed; we
              never see your card number.
            </li>
            <li>
              <b>Product analytics:</b> via PostHog, anonymized per-event data
              about page views and feature use. No resume content is sent.
            </li>
            <li>
              <b>Error monitoring:</b> via Sentry, automatic error reports
              (stack traces) when something breaks. Resume content is not
              transmitted.
            </li>
          </ul>
        </Section>

        <Section title="What we do with it">
          <p>
            Your resume content is sent to OpenAI, Anthropic, Google, and
            Together (our four LLM providers) to generate analysis results,
            and stored in our database so you can return to your reports.
            We do not sell, share, or use your resume content for any other
            purpose. We do not train models on your data.
          </p>
        </Section>

        <Section title="Subprocessors">
          <p>
            tyr depends on the following third parties:{' '}
            <b>Supabase</b> (database + auth + storage), <b>Vercel</b>{' '}
            (hosting), <b>Upstash Redis</b> (caching), <b>Stripe</b>{' '}
            (payments), <b>Resend</b> (transactional email), <b>PostHog</b>{' '}
            (product analytics), <b>Sentry</b> (error monitoring), <b>OpenAI</b>,{' '}
            <b>Anthropic</b>, <b>Google AI</b>, and <b>Together AI</b> (LLM
            inference). Each operates under its own privacy policy.
          </p>
        </Section>

        <Section title="How to delete your data">
          <p>
            Go to <a className="text-ink underline" href="/account">/account</a>{' '}
            and click <b>Delete my account</b>. We immediately delete your
            account, your resume files, your reports, and your builder
            drafts. PostHog / Sentry event data is anonymized but may persist
            in their retention windows (typically 30–90 days).
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy: <b>nour.abdelaziz@yale.edu</b>.
          </p>
        </Section>
      </article>
      <Footer />
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10 text-ink/90 leading-relaxed">
      <h2 className="font-serif text-2xl text-ink mb-3">{title}</h2>
      <div className="text-[15px] text-driftwood leading-[1.72]">{children}</div>
    </section>
  )
}
