import { LandingNav } from '@/components/landing/nav'
import { Hero } from '@/components/landing/hero'
import { ScrollReveal } from '@/components/landing/scroll-reveal'
import { HowItWorks } from '@/components/landing/how-it-works'
import { ReportPreview } from '@/components/landing/report-preview'
import { SampleInsights } from '@/components/landing/sample-insights'
import { FAQ } from '@/components/landing/faq'
import { Footer } from '@/components/landing/footer'

export default function HomePage() {
  return (
    <>
      <LandingNav />
      <Hero />
      <ScrollReveal />
      <HowItWorks />
      <ReportPreview />
      <SampleInsights />
      <FAQ />
      <Footer />
    </>
  )
}
