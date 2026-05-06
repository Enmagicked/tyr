'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TargetForm } from './target-form'
import { isValidTarget, type TargetInput } from './target-validation'

type Step = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'

const STEP_LABELS: Record<Step, string> = {
  idle: 'Drop your PDF here, or click to select',
  uploading: 'Uploading…',
  analyzing: 'Analyzing — running parsers and AI models…',
  done: 'Done. Redirecting…',
  error: 'Something went wrong',
}

interface GraphEvent {
  type: 'node_started' | 'node_completed' | 'node_failed' | 'node_skipped' | 'graph_completed'
  run_id: string
  node?: string
  data?: unknown
  timestamp: number
}

const NODE_LABELS: Record<string, string> = {
  load_resume: 'Reading PDF',
  parse_affinda: 'Parser · Affinda',
  parse_openresume: 'Parser · OpenResume',
  parse_naive: 'Parser · naive',
  perceive_gpt4o: 'GPT-4o',
  perceive_claude: 'Claude',
  perceive_gemini: 'Gemini',
  perceive_llama: 'Llama 3.1',
  parse_resume: 'Aggregating parsers',
  perceive_resume: 'Aggregating LLMs',
  compute_disagreement: 'Parser disagreement',
  compute_perception_disagreement: 'LLM disagreement (σ, ρ)',
  save_results: 'Saving results',
}

export function UploadFlow() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('idle')
  const [target, setTarget] = useState<TargetInput>({ target_role: '', target_company: '' })
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [currentNode, setCurrentNode] = useState<string | null>(null)

  const targetReady = isValidTarget(target)
  const isActive = step !== 'idle' && step !== 'error'

  async function processFile(file: File) {
    if (file.type !== 'application/pdf') {
      setErrorMsg('Only PDF files are supported.')
      setStep('error')
      return
    }

    if (!isValidTarget(target)) {
      setErrorMsg('Fill in target role and company first.')
      setStep('error')
      return
    }

    try {
      setStep('uploading')
      const uploadForm = new FormData()
      uploadForm.append('file', file)
      uploadForm.append('target_role', target.target_role.trim())
      uploadForm.append('target_company', target.target_company.trim())
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: uploadForm })
      if (!uploadRes.ok) {
        const { error } = await uploadRes.json()
        throw new Error(error ?? 'Upload failed')
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
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setStep('error')
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  return (
    <div className="flex flex-col gap-6">
      <TargetForm value={target} onChange={setTarget} disabled={isActive} />

      <div
        onClick={() => !isActive && targetReady && inputRef.current?.click()}
        onDragOver={(e) => {
          if (isActive || !targetReady) return
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          if (isActive || !targetReady) return
          onDrop(e)
        }}
        aria-disabled={isActive || !targetReady}
        className={[
          'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-16 text-center transition-colors',
          targetReady && !isActive ? 'cursor-pointer' : 'cursor-not-allowed',
          isDragging
            ? 'border-ink bg-paper'
            : targetReady
            ? 'border-driftwood/40 hover:border-ink/60 bg-paper/40'
            : 'border-bone bg-paper/20',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={onFileChange}
        />

        {isActive ? (
          <div className="flex flex-col items-center gap-3">
            <Spinner />
            <p className="text-sm text-ink">{STEP_LABELS[step]}</p>
            {step === 'analyzing' && currentNode && (
              <p className="text-xs text-driftwood font-mono">
                {NODE_LABELS[currentNode] ?? currentNode}
              </p>
            )}
          </div>
        ) : step === 'error' ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-medium text-clay">
              {errorMsg || STEP_LABELS.error}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setStep('idle')
                setErrorMsg('')
                setCurrentNode(null)
              }}
              className="text-xs text-driftwood underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="font-serif text-2xl text-ink">
              {targetReady ? 'Drop your PDF here' : 'Fill in target above first'}
            </p>
            <p className="text-xs text-driftwood/70">
              PDF only · ≤10MB · Encrypted at rest
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="h-8 w-8 rounded-full border-2 border-bone border-t-ink animate-spin" />
  )
}
