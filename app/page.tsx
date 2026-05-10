import { LandingNav } from '@/components/landing/nav'
import { Hero } from '@/components/landing/hero'
import { ScrollReveal } from '@/components/landing/scroll-reveal'
import { HowItWorks } from '@/components/landing/how-it-works'
import { ReportPreview } from '@/components/landing/report-preview'
import { SampleInsights } from '@/components/landing/sample-insights'
import { FAQ } from '@/components/landing/faq'
import { Footer } from '@/components/landing/footer'
import { TrackLandingView } from '@/components/landing/track-landing-view'

export default function HomePage() {
  return (
    <>
      <TrackLandingView />
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
