'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Step = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'

const STEP_LABELS: Record<Step, string> = {
  idle: 'Drop your resume here, or click to select',
  uploading: 'Uploading...',
  analyzing: 'Analyzing — running parsers and AI models...',
  done: 'Done! Redirecting...',
  error: 'Something went wrong',
}

interface GraphEvent {
  type: 'node_started' | 'node_completed' | 'node_failed' | 'node_skipped' | 'graph_completed'
  run_id: string
  node?: string
  data?: unknown
  timestamp: number
}

export function ResumeUpload() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [currentNode, setCurrentNode] = useState<string | null>(null)

  async function processFile(file: File) {
    if (file.type !== 'application/pdf') {
      setErrorMsg('Only PDF files are supported.')
      setStep('error')
      return
    }

    try {
      setStep('uploading')
      const uploadForm = new FormData()
      uploadForm.append('file', file)
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

      // Subscribe to streaming events for live progress.
      // Even if the EventSource drops, the graph keeps running server-side —
      // the report page reads from Supabase, not from this connection.
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

  const isActive = step !== 'idle' && step !== 'error'

  return (
    <div
      onClick={() => !isActive && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={[
        'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-16 text-center transition-colors cursor-pointer',
        isDragging ? 'border-black bg-zinc-50' : 'border-zinc-300 hover:border-zinc-400',
        isActive ? 'cursor-default pointer-events-none' : '',
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
          <p className="text-sm text-zinc-600">{STEP_LABELS[step]}</p>
          {step === 'analyzing' && currentNode && (
            <p className="text-xs text-zinc-400 font-mono">{currentNode}</p>
          )}
          <StepProgress step={step} />
        </div>
      ) : step === 'error' ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-red-600">{errorMsg || STEP_LABELS.error}</p>
          <button
            onClick={(e) => { e.stopPropagation(); setStep('idle'); setErrorMsg(''); setCurrentNode(null) }}
            className="text-xs text-zinc-500 underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-zinc-800">Drop your resume here</p>
          <p className="text-xs text-zinc-400">PDF only · max 5MB</p>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="h-8 w-8 rounded-full border-2 border-zinc-200 border-t-zinc-800 animate-spin" />
  )
}

const STEPS: Step[] = ['uploading', 'analyzing']

function StepProgress({ step }: { step: Step }) {
  const currentIdx = STEPS.indexOf(step)
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={[
            'h-2 w-2 rounded-full',
            i < currentIdx ? 'bg-zinc-800' : i === currentIdx ? 'bg-zinc-500' : 'bg-zinc-200',
          ].join(' ')} />
          {i < STEPS.length - 1 && <div className="h-px w-4 bg-zinc-200" />}
        </div>
      ))}
    </div>
  )
}
