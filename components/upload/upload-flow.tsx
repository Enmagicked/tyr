'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import posthog from 'posthog-js'
import { TargetForm } from './target-form'
import { isValidTarget, type TargetInput } from './target-validation'

type Step = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error' | 'paywalled'

const STEP_LABELS: Record<Step, string> = {
  idle: 'Ready',
  uploading: 'Uploading…',
  analyzing: 'Analyzing — running parsers and AI models…',
  done: 'Done. Redirecting…',
  error: 'Something went wrong',
  paywalled: 'Out of credits',
}

interface GraphEvent {
  type: 'node_started' | 'node_completed' | 'node_failed' | 'node_skipped' | 'graph_completed'
  run_id: string
  node?: string
  data?: unknown
  timestamp: number
}

const NODE_LABELS: Record<string, string> = {
  load_resume: 'Reading resume',
  parse_openresume: 'Parser · OpenResume',
  parse_naive: 'Parser · naive',
  perceive_gpt4o: 'GPT-4o',
  perceive_claude: 'Claude',
  perceive_gemini: 'Gemini',
  perceive_llama: 'Llama 3.3',
  parse_resume: 'Aggregating parsers',
  perceive_resume: 'Aggregating LLMs',
  compute_disagreement: 'Parser disagreement',
  compute_perception_disagreement: 'LLM disagreement (σ, ρ)',
  analyze_bullets: 'Bullet analysis',
  synthesize_summary: 'Plain-English summary',
  save_results: 'Saving results',
}

// M8.C: 3 input kinds. Same target plumbing for all; the picker swaps the
// resume-input UI underneath.
type InputKind = 'pdf' | 'url' | 'image'

const INPUT_TABS: { key: InputKind; label: string }[] = [
  { key: 'pdf', label: 'PDF' },
  { key: 'url', label: 'URL' },
  { key: 'image', label: 'Image' },
]

const ACCEPT_BY_KIND: Record<InputKind, string> = {
  pdf: '.pdf,application/pdf',
  image: 'image/png,image/jpeg,image/webp',
  url: '', // unused
}

export function UploadFlow() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('idle')
  const [target, setTarget] = useState<TargetInput>({ target_role: '', target_company: '', target_jd: '' })
  const [inputKind, setInputKind] = useState<InputKind>('pdf')
  const [url, setUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [currentNode, setCurrentNode] = useState<string | null>(null)
  const [buyingCredits, setBuyingCredits] = useState(false)

  const targetReady = isValidTarget(target)
  const isActive = step !== 'idle' && step !== 'error' && step !== 'paywalled'
  const urlReady = inputKind === 'url' && url.trim().length > 0

  // Common submit path. PDF / image branches pass a `file`; URL branch passes
  // null + relies on the `url` state.
  async function submit(file: File | null) {
    if (!isValidTarget(target)) {
      setErrorMsg('Fill in the target role first.')
      setStep('error')
      return
    }
    if (inputKind !== 'url' && !file) {
      setErrorMsg('Choose a file first.')
      setStep('error')
      return
    }
    if (inputKind === 'url' && !urlReady) {
      setErrorMsg('Enter a URL first.')
      setStep('error')
      return
    }

    posthog.capture('resume_upload_started', {
      target_role: target.target_role.trim(),
      has_target_company: target.target_company.trim().length > 0,
      has_target_jd: target.target_jd.trim().length > 0,
      input_kind: inputKind,
      file_size_bytes: file?.size,
    })

    try {
      setStep('uploading')
      const uploadForm = new FormData()
      uploadForm.append('input_kind', inputKind)
      uploadForm.append('target_role', target.target_role.trim())
      uploadForm.append('target_company', target.target_company.trim())
      uploadForm.append('target_jd', target.target_jd.trim())
      if (file) uploadForm.append('file', file)
      if (inputKind === 'url') uploadForm.append('url', url.trim())

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: uploadForm })
      if (uploadRes.status === 402) {
        setStep('paywalled')
        return
      }
      if (!uploadRes.ok) {
        const { error, hint } = await uploadRes.json()
        throw new Error(hint ? `${error} — ${hint}` : (error ?? 'Upload failed'))
      }
      const { resumeId } = await uploadRes.json()

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
      const { runId } = await analyzeRes.json()

      let redirected = false
      function go() {
        if (redirected) return
        redirected = true
        posthog.capture('analysis_completed', { resume_id: resumeId, run_id: runId })
        setStep('done')
        router.push(`/report/${resumeId}`)
      }

      const eventSource = new EventSource(`/api/stream/${runId}`)
      eventSource.onmessage = (e) => {
        const event = JSON.parse(e.data) as GraphEvent
        if (event.type === 'node_started' && event.node) {
          setCurrentNode(event.node)
        }
        if (event.type === 'graph_completed') {
          eventSource.close()
          go()
        }
      }
      eventSource.onerror = () => {
        eventSource.close()
        go()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      posthog.capture('resume_upload_failed', {
        target_role: target.target_role.trim(),
        input_kind: inputKind,
        error_message: message,
      })
      posthog.captureException(err)
      setErrorMsg(message)
      setStep('error')
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) submit(file)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) submit(file)
  }

  async function buyCredits(creditCount: 1 | 5) {
    setBuyingCredits(true)
    posthog.capture('checkout_started', { credit_count: creditCount })
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: creditCount }),
      })
      const { url, error } = await res.json()
      if (!res.ok || !url) throw new Error(error ?? 'Could not start checkout')
      window.location.href = url
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Checkout failed')
      setStep('error')
      setBuyingCredits(false)
    }
  }

  const dropzoneActive = inputKind !== 'url' && targetReady && !isActive

  return (
    <div className="flex flex-col gap-6">
      <TargetForm value={target} onChange={setTarget} disabled={isActive} />

      {/* M8.C: input-kind tabs */}
      <div className="flex items-center gap-1.5" role="tablist" aria-label="Input mode">
        {INPUT_TABS.map((tab) => {
          const active = tab.key === inputKind
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={isActive}
              onClick={() => {
                setInputKind(tab.key)
                setErrorMsg('')
                if (step === 'error') setStep('idle')
              }}
              className={[
                'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-ink text-vellum'
                  : 'bg-paper text-driftwood hover:text-ink border border-bone',
                isActive ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {step === 'paywalled' ? (
        <div className="flex flex-col gap-5 rounded-2xl border border-bone bg-paper/60 p-8 text-center">
          <div>
            <p className="font-serif text-2xl text-ink mb-1">You&rsquo;re out of credits</p>
            <p className="text-sm text-driftwood">
              Buy a pack to keep decoding. Credits never expire.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => buyCredits(1)}
              disabled={buyingCredits}
              className="flex-1 rounded-full border border-bone bg-vellum/50 px-5 py-3 text-sm font-medium text-ink hover:bg-bone disabled:opacity-40 transition-colors"
            >
              {buyingCredits ? '…' : '1 decode — $6'}
            </button>
            <button
              onClick={() => buyCredits(5)}
              disabled={buyingCredits}
              className="flex-1 rounded-full bg-ink px-5 py-3 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40 transition-colors"
            >
              {buyingCredits ? '…' : '5 decodes — $15 (save 50%)'}
            </button>
          </div>
          <button
            onClick={() => setStep('idle')}
            className="text-xs text-driftwood underline"
          >
            Cancel
          </button>
        </div>
      ) : isActive ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-driftwood/40 bg-paper/40 p-16 text-center">
          <Spinner />
          <p className="text-sm text-ink">{STEP_LABELS[step]}</p>
          {step === 'analyzing' && currentNode && (
            <p className="text-xs text-driftwood font-mono">
              {NODE_LABELS[currentNode] ?? currentNode}
            </p>
          )}
        </div>
      ) : step === 'error' ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-clay/30 bg-paper/40 p-16 text-center">
          <p className="text-sm font-medium text-clay">{errorMsg || STEP_LABELS.error}</p>
          <button
            onClick={() => {
              setStep('idle')
              setErrorMsg('')
              setCurrentNode(null)
            }}
            className="text-xs text-driftwood underline"
          >
            Try again
          </button>
        </div>
      ) : inputKind === 'url' ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-bone bg-paper/40 p-6">
          <label htmlFor="resume-url" className="text-xs text-driftwood">
            URL of your personal site, GitHub README, or Notion resume page
          </label>
          <input
            id="resume-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourname.com/resume"
            disabled={!targetReady}
            className="rounded-lg border border-bone bg-vellum/50 px-3 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20 disabled:opacity-50"
          />
          <button
            onClick={() => submit(null)}
            disabled={!targetReady || !urlReady}
            className="self-start rounded-full bg-ink px-5 py-2 text-sm font-medium text-vellum hover:bg-ink/90 disabled:opacity-40"
          >
            Decode URL →
          </button>
          <p className="text-[12px] text-driftwood/80 leading-relaxed">
            We fetch the page server-side, run Mozilla Readability to extract
            the main text, then feed that to the same parsers and LLMs as a
            PDF upload. Private IPs and non-http schemes are rejected.
          </p>
        </div>
      ) : (
        <div
          onClick={() => dropzoneActive && fileInputRef.current?.click()}
          onDragOver={(e) => {
            if (!dropzoneActive) return
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            if (!dropzoneActive) return
            onDrop(e)
          }}
          aria-disabled={!dropzoneActive}
          className={[
            'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-16 text-center transition-colors',
            dropzoneActive ? 'cursor-pointer' : 'cursor-not-allowed',
            isDragging
              ? 'border-ink bg-paper'
              : dropzoneActive
              ? 'border-driftwood/40 hover:border-ink/60 bg-paper/40'
              : 'border-bone bg-paper/20',
          ].join(' ')}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_BY_KIND[inputKind]}
            className="hidden"
            onChange={onFileChange}
          />
          <p className="font-serif text-2xl text-ink">
            {!targetReady
              ? 'Fill in target above first'
              : inputKind === 'image'
              ? 'Drop your resume image here'
              : 'Drop your PDF here'}
          </p>
          <p className="text-xs text-driftwood/70">
            {inputKind === 'image' ? 'PNG / JPEG / WebP · ≤10MB · OCR\'d server-side' : 'PDF only · ≤10MB · Encrypted at rest'}
          </p>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="h-8 w-8 rounded-full border-2 border-bone border-t-ink animate-spin" />
  )
}
