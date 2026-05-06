'use client'

import Link from 'next/link'
import { useScroll } from '@/lib/scroll/use-scroll'

interface LandingNavProps {
  // /upload uses the scrolled (vellum) variant from page load — the page
  // background is vellum, not the dark hero video. forceScrolledStyle skips
  // the scroll listener and renders the scrolled state immediately.
  forceScrolledStyle?: boolean
}

const NAV_LINKS = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Reports', href: '/#reports' },
  { label: 'FAQ', href: '/#faq' },
]

export function LandingNav({ forceScrolledStyle = false }: LandingNavProps) {
  const scrollY = useScroll()
  const scrolled = forceScrolledStyle || scrollY > 60

  return (
    <nav
      className={[
        'fixed top-0 left-0 right-0 z-[200] flex items-center justify-between',
        'px-6 md:px-12 py-4 transition-all duration-[450ms]',
        scrolled
          ? 'bg-vellum/95 backdrop-blur-lg border-b border-bone'
          : 'border-b border-transparent',
      ].join(' ')}
    >
      <Link
        href="/"
        className={[
          'font-serif text-[22px] tracking-[-0.02em] transition-colors duration-[450ms] lowercase',
          scrolled ? 'text-ink' : 'text-vellum',
        ].join(' ')}
      >
        tyr
      </Link>

      <div className="flex items-center gap-6 md:gap-8">
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className={[
                'text-[13px] transition-colors duration-[450ms]',
                scrolled ? 'text-driftwood hover:text-ink' : 'text-vellum/70 hover:text-vellum',
              ].join(' ')}
            >
              {l.label}
            </a>
          ))}
        </div>
        <Link
          href="/upload"
          className={[
            'text-[13px] font-medium px-5 py-2 rounded-full transition-all duration-[450ms]',
            scrolled
              ? 'bg-ink text-vellum hover:bg-ink/90'
              : 'bg-vellum text-ink hover:bg-vellum/90',
          ].join(' ')}
        >
          Decode my resume →
        </Link>
      </div>
    </nav>
  )
}
