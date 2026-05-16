'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import posthog from 'posthog-js'
import { useScroll } from '@/lib/scroll/use-scroll'
import { useReducedMotion } from '@/lib/scroll/use-reduced-motion'
import { clamp } from '@/lib/scroll/easings'

// Hero section. Sticky 100vh viewport inside a 140vh outer so the video
// parallaxes "down" as the user scrolls, while content lifts away.
//
// Mobile parallax is intentionally muted (M4 risk #9) — iOS Safari fires
// scroll events at lower frequency during momentum-scroll, so heavy
// transforms look janky. We disable parallax under 900px viewport width.

export function Hero() {
  const heroRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)
  const scrollY = useScroll()
  const reduced = useReducedMotion()

  useEffect(() => {
    const vid = videoRef.current
    const content = contentRef.current
    const cue = cueRef.current
    if (!vid || !content) return

    if (reduced) {
      vid.style.transform = ''
      vid.style.filter = ''
      content.style.opacity = ''
      content.style.transform = ''
      if (cue) cue.style.opacity = ''
      return
    }

    const heroH = heroRef.current?.offsetHeight ?? window.innerHeight * 1.4
    const prog = clamp(scrollY / heroH, 0, 1)
    const isMobile = window.innerWidth < 900

    if (isMobile) {
      vid.style.transform = ''
      vid.style.filter = `brightness(${1 - prog * 0.18})`
    } else {
      vid.style.transform = `translateY(${prog * 14}%) scale(${1 + prog * 0.04})`
      vid.style.filter = `brightness(${1 - prog * 0.18})`
    }

    const contentOp = clamp(1 - scrollY / (heroH * 0.45), 0, 1)
    const contentY = isMobile ? scrollY * 0.08 : scrollY * 0.22
    content.style.opacity = String(contentOp)
    content.style.transform = `translateY(${-contentY}px)`

    if (cue) cue.style.opacity = String(clamp(1 - scrollY / 160, 0, 1))
  }, [scrollY, reduced])

  return (
    <div ref={heroRef} className="relative h-[140vh] overflow-hidden">
      <div className="sticky top-0 h-[100vh] overflow-hidden">
        {/* video */}
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          poster=""
          className="absolute inset-0 w-full h-full object-cover origin-top will-change-transform"
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>

        {/* fallback gradient when video is blocked */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-midnight to-ink"
        />

        {/* vignette — merges video into vellum */}
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 110% 90% at 50% 40%, transparent 30%, rgba(239,233,219,.7) 68%, #EFE9DB 90%),
              linear-gradient(to top, #EFE9DB 0%, transparent 30%),
              linear-gradient(to bottom, rgba(15,24,48,.28) 0%, transparent 24%)
            `,
          }}
        />

        {/* content */}
        <div
          ref={contentRef}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center pt-[6vh] px-6"
        >
          <h1
            className="font-serif text-vellum text-center mb-5 animate-fade-up"
            style={{
              fontSize: 'clamp(44px, 6.5vw, 86px)',
              fontWeight: 400,
              lineHeight: 1.04,
              letterSpacing: '-0.028em',
              textShadow: '0 2px 32px rgba(15,24,48,.22)',
            }}
          >
            Let&apos;s be real: AI is being used in job recruiting.
            <br />
            <em className="italic text-marigold">See how AI sees you</em>.
          </h1>
          <p
            className="text-center max-w-[480px] mx-auto mb-8 animate-fade-up"
            style={{
              fontSize: 17,
              lineHeight: 1.72,
              color: 'rgba(239,233,219,.78)',
              animationDelay: '0.14s',
            }}
          >
            Four frontier LLMs and three ATS parsers read your resume in
            parallel. Tyr's unique mathematical algorithm surfaces where they agree, where they disagree,
            and what that gap tells you about how you will be read.
          </p>
          <div
            className="flex gap-3 animate-fade-up flex-wrap justify-center"
            style={{ animationDelay: '0.26s' }}
          >
            <Link
              href="/upload"
              onClick={() => posthog.capture('cta_click', { location: 'hero_primary', destination: '/upload' })}
              className="text-sm font-medium px-7 py-3 rounded-full bg-vellum text-ink shadow-[0_4px_28px_rgba(15,24,48,.22)] hover:scale-[1.025] hover:shadow-[0_6px_36px_rgba(15,24,48,.3)] transition-transform duration-200"
            >
              Decode my resume →
            </Link>
            <Link
              href="/builder"
              onClick={() => posthog.capture('cta_click', { location: 'hero_secondary', destination: '/builder' })}
              className="text-sm font-medium px-7 py-3 rounded-full bg-marigold/95 text-ink shadow-[0_4px_28px_rgba(15,24,48,.22)] hover:bg-marigold hover:scale-[1.025] hover:shadow-[0_6px_36px_rgba(15,24,48,.3)] transition-all duration-200"
            >
              No resume yet? Build one →
            </Link>
          </div>
        </div>

        {/* scroll cue */}
        <div
          ref={cueRef}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 animate-fade-up"
          style={{ animationDelay: '1s', animationDuration: '1.4s' }}
        >
          <div className="w-px h-11 bg-gradient-to-b from-vellum/40 to-transparent" />
          <span className="text-[10px] tracking-[0.14em] text-vellum/30 uppercase">
            scroll
          </span>
        </div>
      </div>
    </div>
  )
}
