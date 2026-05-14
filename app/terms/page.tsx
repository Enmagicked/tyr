import { LandingNav } from '@/components/landing/nav'
import { Footer } from '@/components/landing/footer'

export const metadata = {
  title: 'Terms — tyr',
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <article className="mx-auto max-w-2xl px-6 pt-32 pb-24 md:px-12">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
          Legal
        </p>
        <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.08] tracking-[-0.026em] mb-8">
          Terms of service
        </h1>
        <p className="text-driftwood mb-10 leading-relaxed">
          Last updated: 2026-05-14. By using tyr (the &ldquo;Service&rdquo;)
          at usetyr.com, you agree to these terms.
        </p>

        <Section title="What the Service does">
          <p>
            tyr generates and analyzes resumes using third-party large language
            models. The analysis output is informational only — it is not
            career advice, employment guidance, or a guarantee about how any
            specific recruiter, ATS, or company will read your resume.
          </p>
        </Section>

        <Section title="Eligibility">
          <p>
            You must be at least 18 years old (or the age of majority in your
            jurisdiction) and capable of forming a binding contract to use
            tyr. You are responsible for the accuracy of the information you
            submit.
          </p>
        </Section>

        <Section title="Account & content">
          <p>
            You may not upload resume content that is not yours, that infringes
            anyone&apos;s rights, or that contains malicious code. You retain
            all rights to the content you upload. You grant tyr a limited
            license to process that content via our third-party LLM providers
            and to store it in your account so you can revisit reports.
          </p>
        </Section>

        <Section title="Credits & payments">
          <p>
            Each new account gets 1 free analyzer credit. Additional credits
            are sold via Stripe in packs of 1 ($6) and 5 ($15). Credits do
            not expire. Each analyzer run or builder run consumes 1 credit.
            All sales are final — we do not offer automatic refunds, but if
            something goes wrong on our end (the analysis failed, a charge was
            duplicated, etc.) email us and we&apos;ll make it right.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>
            Don&apos;t use tyr to: (a) attempt to extract or reverse-engineer
            our prompts or system; (b) flood the service with automated
            requests; (c) impersonate someone else or upload their resume
            without consent; (d) generate resumes intended to defraud an
            employer about your background.
          </p>
        </Section>

        <Section title="AI-generated content">
          <p>
            The analysis and the resumes the Builder generates are produced by
            large language models, which can make mistakes, fabricate details,
            or produce biased output. You are responsible for reviewing any
            generated text before sending it to a real employer. tyr makes no
            warranty about correctness, completeness, or fitness for purpose.
          </p>
        </Section>

        <Section title="Service availability">
          <p>
            We try to keep tyr running, but we offer no uptime guarantee. We
            may modify, suspend, or discontinue the Service at any time. If
            we discontinue the Service, we&apos;ll give you a reasonable
            window to export your data.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, tyr&apos;s total liability
            for any claim arising out of your use of the Service is limited
            to the amount you paid us in the 12 months preceding the claim.
            We are not liable for indirect, incidental, or consequential
            damages.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update these terms. Material changes will be flagged on
            this page with a new &ldquo;Last updated&rdquo; date. Continued
            use after a change constitutes acceptance.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions: <b>nour.abdelaziz@yale.edu</b>.
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
