'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import posthog from 'posthog-js'
import { BuilderForm, emptyBuilderInput } from './builder-form'
import { TargetForm } from '@/components/upload/target-form'
import { isValidTarget, type TargetInput } from '@/components/upload/target-validation'
import type { BuilderInput } from '@/lib/builder/types'
import type { BuilderSourceContext } from '@/lib/builder/source-context'

type Step = 'idle' | 'generating' | 'analyzing' | 'paywalled' | 'error'

interface GraphEvent {
  type: string
  node?: string
}

interface BuilderFlowProps {
  // Pass-through from the page's ?from=X searchParam. If set, BuilderFlow
  // fetches /api/builder/prefill on mount and populates input + target.
  sourceResumeId?: string | null
}

export function BuilderFlow({ sourceResumeId = null }: BuilderFlowProps) {
  const router = useRouter()
  const [input, setInput] = useState<BuilderInput>(emptyBuilderInput())
  const [target, setTarget] = useState<TargetInput>({
    target_role: '',
    target_company: '',
    target_jd: '',
    is_internship: false,
  })
  const [sourceContext, setSourceContext] = useState<BuilderSourceContext | null>(null)
  const [prefilling, setPrefilling] = useState<boolean>(!!sourceResumeId)
  const [prefillError, setPrefillError] = useState<string | null>(null)

  // Client-side prefill: when ?from=<resumeId> is set, hit the prefill
  // endpoint which runs the Haiku extraction and returns the structured
  // BuilderInput + analyzer-findings consensus. Server-side blocking
  // version made the page take 5-10s to TTFB.
  useEffect(() => {
    if (!sourceResumeId) return
    let cancelled = false
    setPrefilling(true)
    fetch(`/api/builder/prefill?resumeId=${encodeURIComponent(sourceResumeId)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string; detail?: string }
          throw new Error(body.detail ?? body.error ?? `HTTP ${r.status}`)
        }
        return (await r.json()) as BuilderSourceContext
      })
      .then((ctx) => {
        if (cancelled) return
        setSourceContext(ctx)
        if (ctx.prefilled_input) setInput(ctx.prefilled_input)
        setTarget({
          target_role: ctx.target_role ?? '',
          target_company: ctx.target_company ?? '',
          target_jd: ctx.target_jd ?? '',
          is_internship: ctx.is_internship ?? false,
        })
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[builder] prefill failed:', msg)
        setPrefillError(msg)
      })
      .finally(() => {
        if (!cancelled) setPrefilling(false)
      })
    return () => {
      cancelled = true
    }
  }, [sourceResumeId])
  const [step, setStep] = useState<Step>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [currentNode, setCurrentNode] = useState<string | null>(null)
  const [buyingCredits, setBuyingCredits] = useState(false)
  const [isFirstPurchase, setIsFirstPurchase] = useState(true)

  const formReady =
    input.contact.name.trim().length > 0 &&
    input.contact.email.trim().length > 0 &&
    isValidTarget(target) &&
    (input.experiences.length > 0 ||
      input.projects.length > 0 ||
      input.activities.length > 0 ||
      input.education.length > 0)

  const isActive = step === 'generating' || step === 'analyzing'

  async function buyCredits(tier: 'intro' | 'single' | 'bulk') {
    setBuyingCredits(true)
    try {
      const r = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, return_to: '/builder' }),
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
          source_resume_id: sourceResumeId ?? undefined,
        }),
      })

      if (r.status === 402) {
        const body = (await r.json().catch(() => ({}))) as { is_first_purchase?: boolean }
        setIsFirstPurchase(body.is_first_purchase ?? true)
        setStep('paywalled')
        return
      }
      if (!r.ok) {
        const { error, detail, hint } = (await r.json().catch(() => ({}))) as {
          error?: string
          detail?: string
          hint?: string
        }
        const tail = detail ?? hint
        throw new Error(tail ? `${error} — ${tail}` : (error ?? 'Builder failed'))
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
      {sourceResumeId && (
        <div
          className={[
            'rounded-2xl border p-5 md:p-6 transition-colors',
            prefilling
              ? 'border-marigold/50 bg-marigold/10'
              : 'border-marigold/30 bg-marigold/5',
          ].join(' ')}
        >
          <div className="flex items-center gap-2 mb-2">
            {prefilling && (
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full border-2 border-marigold/40 border-t-marigold animate-spin"
              />
            )}
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood">
              {prefilling ? 'Rebuilding from your scan…' : 'Rebuilding from your scan'}
            </p>
          </div>
          {prefilling ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center gap-3 mb-4">
                <span
                  aria-hidden="true"
                  className="inline-block h-5 w-5 rounded-full border-2 border-marigold/30 border-t-marigold animate-spin"
                />
                <p className="font-serif text-xl md:text-2xl text-ink">
                  Reading your resume…
                </p>
              </div>
              <p className="text-[14px] text-driftwood leading-relaxed max-w-md mx-auto mb-3">
                Claude is extracting every section of your PDF — contact,
                education, experiences, projects, activities, skills,
                awards — so you don&apos;t have to retype any of it.
              </p>
              <p className="text-[13px] text-marigold font-medium">
                ⏱ This can take up to a minute on a cold start — please don&apos;t
                refresh.
              </p>
              <div className="mt-5 flex flex-col gap-1.5 text-[12px] text-driftwood/80 max-w-xs mx-auto">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-marigold animate-pulse" />
                  Calling Claude on the resume text…
                </div>
                <div className="flex items-center gap-2 opacity-60">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-driftwood/40" />
                  Mapping into your form fields…
                </div>
              </div>
            </div>
          ) : sourceContext ? (
            <>
              <p className="text-sm text-ink mb-2">
                Source:{' '}
                <span className="font-medium">
                  {sourceContext.file_name ?? 'previous resume'}
                </span>
              </p>
              {sourceContext.missing_signal && (
                <p className="text-[13px] text-driftwood leading-relaxed">
                  <span className="text-ink font-medium">Gap the AI will avoid:</span>{' '}
                  {sourceContext.missing_signal}
                </p>
              )}
              {sourceContext.top_strengths && sourceContext.top_strengths.length > 0 && (
                <p className="text-[13px] text-driftwood leading-relaxed mt-1.5">
                  <span className="text-ink font-medium">Strengths to lean into:</span>{' '}
                  {sourceContext.top_strengths.slice(0, 3).join(' · ')}
                </p>
              )}
              <p className="text-[12px] text-driftwood/70 mt-3">
                Every section we could extract from the PDF — contact,
                education, experiences, projects, activities, skills,
                awards — has been pre-filled. Edit anything below.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-clay">
              Couldn&apos;t load the prefill{prefillError ? ` — ${prefillError}` : ''}.
              You can still build manually below.
            </p>
          )}
        </div>
      )}

      <TargetForm value={target} onChange={setTarget} disabled={isActive} />

      <BuilderForm value={input} onChange={setInput} disabled={isActive} />

      {step === 'error' && (
        <div className="rounded-lg border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
          {errorMsg}
        </div>
      )}

      {step === 'paywalled' && (
        <PaywallModal
          isFirstPurchase={isFirstPurchase}
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
  isFirstPurchase: boolean
  buying: boolean
  onBuy: (tier: 'intro' | 'single' | 'bulk') => void
  onClose: () => void
}

function PaywallModal({ isFirstPurchase, buying, onBuy, onClose }: PaywallModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
      <div className="max-w-md w-full rounded-2xl bg-paper p-8 shadow-xl">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-2">
          {isFirstPurchase ? 'Get started' : 'Out of credits'}
        </p>
        <h2 className="font-serif text-2xl text-ink mb-3">
          {isFirstPurchase ? 'Unlock your first build' : 'Buy credits to keep going'}
        </h2>
        <p className="text-sm text-driftwood leading-relaxed mb-6">
          {isFirstPurchase
            ? 'One-time $4 to generate your resume and score it through 4 frontier LLMs. Credits never expire.'
            : 'Each build is 1 credit. Pick a pack:'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          {isFirstPurchase ? (
            <button
              onClick={() => onBuy('intro')}
              disabled={buying}
              className="flex-1 rounded-full bg-marigold px-5 py-3 text-sm font-medium text-ink hover:brightness-105 disabled:opacity-40 transition-all"
            >
              {buying ? '…' : 'Intro — 1 build — $4'}
            </button>
          ) : (
            <button
              onClick={() => onBuy('single')}
              disabled={buying}
              className="flex-1 rounded-full border border-bone bg-vellum/50 px-5 py-3 text-sm font-medium text-ink hover:bg-bone disabled:opacity-40 transition-colors"
            >
              {buying ? '…' : '1 decode — $6'}
            </button>
          )}
          <button
            onClick={() => onBuy('bulk')}
            disabled={buying}
            className="flex-1 rounded-full bg-ink px-5 py-3 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
          >
            {buying ? '…' : '5 decodes — $15'}
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
