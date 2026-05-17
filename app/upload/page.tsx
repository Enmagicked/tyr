import Link from 'next/link'
import { UploadFlow } from '@/components/upload/upload-flow'
import { CreditsAddedBanner } from '@/components/upload/credits-added-banner'
import { LandingNav } from '@/components/landing/nav'

export const metadata = {
  title: 'Upload — tyr',
}

export default function UploadPage() {
  return (
    <main className="min-h-screen bg-vellum">
      <LandingNav forceScrolledStyle />
      <div className="mx-auto max-w-3xl px-6 pt-32 pb-24 md:px-12">
        <div className="mb-12 text-center">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-3">
            Upload your resume
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-ink leading-[1.08] tracking-[-0.026em]">
            Two reports. One upload.
          </h1>
          <p className="mt-4 text-driftwood max-w-md mx-auto leading-[1.72]">
            Tell us what role you are targeting so the AI judges read your
            resume against the right bar. Then drop your PDF.
          </p>
          <p className="mt-4 text-[13px] text-driftwood/80">
            No resume yet?{' '}
            <Link
              href="/builder"
              className="text-thistle underline underline-offset-2 hover:text-thistle/80"
            >
              Build one from your activities →
            </Link>
          </p>
        </div>
        <CreditsAddedBanner />
        <UploadFlow />
      </div>
    </main>
  )
}
