'use client'

import { useState } from 'react'

export default function TestPage() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/test-perception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: text }),
      })
      let data: unknown
      const raw = await res.text()
      try {
        data = JSON.parse(raw)
      } catch {
        throw new Error(`Server error (${res.status}): ${raw || 'empty response — check terminal for stack trace'}`)
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Perception Engine — Smoke Test</h1>
          <p className="text-sm text-zinc-500 mt-1">Paste resume text, hit Run. Calls GPT-4o + Claude only. No auth or DB.</p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste plain resume text here..."
          rows={12}
          className="w-full rounded-lg border border-zinc-300 bg-white p-4 text-sm font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-y"
        />

        <button
          onClick={run}
          disabled={loading || text.trim().length < 50}
          className="self-start rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Running 12 LLM calls...' : 'Run'}
        </button>

        {error && (
          <p className="text-sm text-red-600 font-medium">{error}</p>
        )}

        {result !== null && (
          <div className="flex flex-col gap-4">
            <ReportSummary report={(result as { report: Record<string, unknown> }).report} />
            <details className="rounded-lg border border-zinc-200 bg-white">
              <summary className="cursor-pointer p-4 text-sm font-medium text-zinc-600">Raw JSON</summary>
              <pre className="overflow-auto p-4 text-xs text-zinc-700 border-t border-zinc-100">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </main>
  )
}

function ReportSummary({ report }: { report: Record<string, unknown> }) {
  const seniority = report.seniority_by_model as Record<string, string> | undefined
  const divergent = report.divergent_seniority as boolean
  const consensusSkills = report.consensus_skills as string[] | undefined
  const recommendations = report.top_recommendations as string[] | undefined
  const descriptions = report.description_by_model as Record<string, string> | undefined

  return (
    <div className="flex flex-col gap-4">
      {seniority && (
        <Card title={`Seniority ${divergent ? '⚠ Models disagree' : '✓ Consensus'}`}>
          {Object.entries(seniority).map(([model, level]) => (
            <Row key={model} label={model} value={level} />
          ))}
          {divergent && report.seniority_note !== undefined && (
            <p className="text-xs text-amber-600 mt-2">{String(report.seniority_note)}</p>
          )}
        </Card>
      )}

      {descriptions && (
        <Card title="How each model describes you">
          {Object.entries(descriptions).map(([model, desc]) => (
            <div key={model} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-400">{model}</span>
              <p className="text-sm text-zinc-700">{desc}</p>
            </div>
          ))}
        </Card>
      )}

      {consensusSkills && consensusSkills.length > 0 && (
        <Card title="Skills all models agree on">
          <div className="flex flex-wrap gap-2">
            {consensusSkills.map((s) => (
              <span key={s} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">{s}</span>
            ))}
          </div>
        </Card>
      )}

      {recommendations && recommendations.length > 0 && (
        <Card title="Top gaps identified">
          <ul className="flex flex-col gap-2">
            {recommendations.map((r, i) => (
              <li key={i} className="text-sm text-zinc-700">• {r}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-800 capitalize">{value}</span>
    </div>
  )
}
