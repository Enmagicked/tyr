'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import posthog from 'posthog-js'
import { BuilderForm, emptyBuilderInput } from './builder-form'
import { TargetForm } from '@/components/upload/target-form'
import { isValidTarget, type TargetInput } from '@/components/upload/target-validation'
import type { BuilderInput } from '@/lib/builder/types'

type Step = 'idle' | 'generating' | 'analyzing' | 'paywalled' | 'builder_locked' | 'error'

interface GraphEvent {
  type: string
  node?: string
}

export function BuilderFlow() {
  const router = useRouter()
  const [input, setInput] = useState<BuilderInput>(emptyBuilderInput())
  const [target, setTarget] = useState<TargetInput>({
    target_role: '',
    target_company: '',
    target_jd: '',
    is_internship: false,
  })
  const [step, setStep] = useState<Step>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [currentNode, setCurrentNode] = useState<string | null>(null)
  const [buyingCredits, setBuyingCredits] = useState(false)

  const formReady =
    input.contact.name.trim().length > 0 &&
    input.contact.email.trim().length > 0 &&
    isValidTarget(target) &&
    (input.experiences.length > 0 ||
      input.projects.length > 0 ||
      input.activities.length > 0 ||
      input.education.length > 0)

  const isActive = step === 'generating' || step === 'analyzing'

  async function buyCredits(credits: 1 | 5) {
    setBuyingCredits(true)
    try {
      const r = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits }),
      })
      if (!r.ok) {
        const { error } = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
        throw new Error(error ?? 'Checkout failed')
      }
      const { url } = (await r.json()) as { url: string }
      window.location.href = url
    } catch (err) {
      setBuyingCredits(false)
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed')
      setStep('error')
    }
  }

  async function submit() {
    if (!formReady) {
      setErrorMsg('Fill in your name, email, target role, and at least one experience or project.')
      setStep('error')
      return
    }

    posthog.capture('builder_submit_clicked', {
      experiences: input.experiences.length,
      projects: input.projects.length,
      activities: input.activities.length,
      is_internship: target.is_internship,
      has_target_jd: target.target_jd.trim().length > 0,
    })

    setStep('generating')
    setErrorMsg('')

    try {
      const r = await fetch('/api/builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          target_role: target.target_role.trim(),
          target_company: target.target_company.trim(),
          target_jd: target.target_jd.trim(),
          is_internship: target.is_internship,
        }),
      })

      if (r.status === 402) {
        const { code } = (await r.json().catch(() => ({}))) as { code?: string }
        setStep(code === 'BUILDER_LOCKED' ? 'builder_locked' : 'paywalled')
        return
      }
      if (!r.ok) {
        const { error, detail } = (await r.json().catch(() => ({}))) as {
          error?: string
          detail?: string
        }
        throw new Error(detail ? `${error} — ${detail}` : (error ?? 'Builder failed'))
      }

      const { resumeId } = (await r.json()) as { resumeId: string }

      // Kick off the analysis graph for scoring
      setStep('analyzing')
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId }),
      })
      if (!analyzeRes.ok) {
        const { error } = await analyzeRes.json()
        throw new Error(error ?? 'Analysis failed')
      }
      const { runId } = (await analyzeRes.json()) as { runId: string }

      let redirected = false
      function go() {
        if (redirected) return
        redirected = true
        posthog.capture('builder_completed', { resume_id: resumeId, run_id: runId })
        router.push(`/builder/${resumeId}`)
      }

      const es = new EventSource(`/api/stream/${runId}`)
      es.onmessage = (e) => {
        const event = JSON.parse(e.data) as GraphEvent
        if (event.type === 'node_started' && event.node) setCurrentNode(event.node)
        if (event.type === 'graph_completed') {
          es.close()
          go()
        }
      }
      es.onerror = () => {
        es.close()
        go()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      posthog.captureException(err)
      setErrorMsg(message)
      setStep('error')
    }
  }

  return (
    <div className="space-y-8">
      <TargetForm value={target} onChange={setTarget} disabled={isActive} />

      <BuilderForm value={input} onChange={setInput} disabled={isActive} />

      {step === 'error' && (
        <div className="rounded-lg border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
          {errorMsg}
        </div>
      )}

      {step === 'paywalled' && (
        <PaywallModal
          variant="quota"
          buying={buyingCredits}
          onBuy={buyCredits}
          onClose={() => setStep('idle')}
        />
      )}

      {step === 'builder_locked' && (
        <PaywallModal
          variant="locked"
          buying={buyingCredits}
          onBuy={buyCredits}
          onClose={() => setStep('idle')}
        />
      )}

      {isActive ? (
        <div className="rounded-2xl border border-bone bg-paper p-6 text-center">
          <p className="font-serif text-2xl text-ink mb-2">
            {step === 'generating' ? 'Generating your resume…' : 'Scoring with 4 recruiter-AIs…'}
          </p>
          <p className="text-sm text-driftwood">
            {step === 'generating'
              ? 'Claude is synthesizing your inputs into a polished resume.'
              : currentNode ? `running ${currentNode}…` : 'starting the perception graph…'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-driftwood/80">
            1 credit per build · includes 4-LLM scoring + up to 5 bullet rewrites
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!formReady || isActive}
            className="rounded-full bg-ink px-8 py-3 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
          >
            Build &amp; score my resume
          </button>
        </div>
      )}
    </div>
  )
}

interface PaywallModalProps {
  variant: 'quota' | 'locked'
  buying: boolean
  onBuy: (credits: 1 | 5) => void
  onClose: () => void
}

function PaywallModal({ variant, buying, onBuy, onClose }: PaywallModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
      <div className="max-w-md w-full rounded-2xl bg-paper p-8 shadow-xl">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-2">
          {variant === 'locked' ? 'Builder locked' : 'Out of credits'}
        </p>
        <h2 className="font-serif text-2xl text-ink mb-3">
          {variant === 'locked'
            ? 'Your free credit is analyzer-only'
            : 'Buy credits to keep going'}
        </h2>
        <p className="text-sm text-driftwood leading-relaxed mb-6">
          {variant === 'locked'
            ? 'The Activities Builder is a paid feature. Purchase a credit pack to unlock it — credits work for both the builder and the analyzer.'
            : 'Each build is 1 credit. Pick a pack:'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => onBuy(1)}
            disabled={buying}
            className="flex-1 rounded-full border border-bone bg-vellum/50 px-5 py-3 text-sm font-medium text-ink hover:bg-bone disabled:opacity-40 transition-colors"
          >
            {buying ? '…' : '1 decode — $6'}
          </button>
          <button
            onClick={() => onBuy(5)}
            disabled={buying}
            className="flex-1 rounded-full bg-ink px-5 py-3 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
          >
            {buying ? '…' : '5 decodes — $15 (save 50%)'}
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full text-[12px] text-driftwood/80 hover:text-ink"
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
