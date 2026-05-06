'use client'

import { useEffect, useRef, useState } from 'react'
import { easeOutCubic } from '@/lib/scroll/easings'
import { useReducedMotion } from '@/lib/scroll/use-reduced-motion'

interface CountUpProps {
  value: number | null
  duration?: number  // ms
  decimals?: number
  suffix?: string
  prefix?: string
  className?: string
  // Trigger immediately rather than waiting for IntersectionObserver — handy
  // for above-the-fold cards that are already in the viewport on mount.
  immediate?: boolean
}

// Counts up from 0 to `value` over `duration` ms when its container scrolls
// into view. Single rAF loop, cancels on unmount. Respects
// prefers-reduced-motion (jumps straight to value).
//
// Returns "—" when value is null (M2/M3 graceful-degradation case).
export function CountUp({
  value,
  duration = 900,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
  immediate = false,
}: CountUpProps) {
  const [display, setDisplay] = useState(value === null ? null : 0)
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (value === null) {
      setDisplay(null)
      return
    }

    if (reduced) {
      setDisplay(value)
      return
    }

    const el = ref.current
    if (!el) {
      setDisplay(value)
      return
    }

    let raf = 0
    let started = false
    function start() {
      if (started) return
      started = true
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration)
        const eased = easeOutCubic(t)
        setDisplay((value as number) * eased)
        if (t < 1) raf = requestAnimationFrame(tick)
        else setDisplay(value as number)
      }
      raf = requestAnimationFrame(tick)
    }

    if (immediate) {
      start()
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) start()
        },
        { threshold: 0.4 }
      )
      io.observe(el)
      return () => {
        io.disconnect()
        if (raf) cancelAnimationFrame(raf)
      }
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [value, duration, immediate, reduced])

  if (display === null) {
    return (
      <span ref={ref} className={className}>
        —
      </span>
    )
  }

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  )
}
