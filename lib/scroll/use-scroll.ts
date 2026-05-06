'use client'

import { useEffect, useState } from 'react'

// Live scroll-Y value. Subscribes once on mount, cleans up on unmount.
// Passive listener — does not block the scroll thread.
export function useScroll(): number {
  const [y, setY] = useState(0)

  useEffect(() => {
    const handler = () => setY(window.scrollY)
    handler() // sync on mount so SSR'd content lines up immediately
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return y
}

// Element-relative scroll progress in [0, 1]. 0 when the element's top hits
// the bottom of the viewport, 1 when its bottom hits the top. Lets parallax
// effects fire only while the element is in or near the viewport.
//
// Returns 0 on the server / before mount — components must tolerate that.
export function useElementProgress(ref: React.RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current

    function update() {
      const rect = el.getBoundingClientRect()
      const total = el.offsetHeight - window.innerHeight
      if (total <= 0) {
        setProgress(rect.top <= 0 ? 1 : 0)
        return
      }
      const raw = -rect.top / total
      setProgress(raw < 0 ? 0 : raw > 1 ? 1 : raw)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [ref])

  return progress
}
