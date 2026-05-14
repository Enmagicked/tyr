'use client'

import { useId, useRef, useState } from 'react'
import posthog from 'posthog-js'
import {
  COMMON_ROLES,
  JD_MAX,
  validateTarget,
  type TargetInput,
} from './target-validation'

interface TargetFormProps {
  value: TargetInput
  onChange: (next: TargetInput) => void
  disabled?: boolean
}

export function TargetForm({ value, onChange, disabled }: TargetFormProps) {
  const roleId = useId()
  const companyId = useId()
  const jdId = useId()
  const jdImageInputRef = useRef<HTMLInputElement>(null)
  const [jdImageStatus, setJdImageStatus] = useState<'idle' | 'extracting' | 'error'>('idle')
  const [jdImageError, setJdImageError] = useState('')
  const validation = validateTarget(value)
  const jdLength = value.target_jd.trim().length

  async function handleJdImage(file: File) {
    setJdImageError('')
    setJdImageStatus('extracting')
    posthog.capture('jd_image_uploaded', { file_size_bytes: file.size, mime: file.type })
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload-jd-image', { method: 'POST', body: fd })
      if (!r.ok) {
        const { error } = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
        throw new Error(error ?? 'OCR failed')
      }
      const { text } = (await r.json()) as { text: string }
      onChange({ ...value, target_jd: text })
      setJdImageStatus('idle')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read the image'
      setJdImageError(message)
      setJdImageStatus('error')
    }
  }

  return (
    <div className="rounded-2xl border border-bone bg-paper p-6 md:p-8">
      <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-5">
        Target
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor={roleId} className="flex flex-col gap-1.5">
          <span className="text-xs text-driftwood">
            Role <span className="text-driftwood/60">(or type your own)</span>
          </span>
          <input
            id={roleId}
            list={`${roleId}-list`}
            type="text"
            value={value.target_role}
            onChange={(e) =>
              onChange({ ...value, target_role: e.target.value })
            }
            placeholder="Software Engineer — or anything else"
            disabled={disabled}
            className="rounded-lg border border-bone bg-vellum/50 px-3 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20 disabled:opacity-50"
          />
          <datalist id={`${roleId}-list`}>
            {COMMON_ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <span className="text-[11px] text-driftwood/70">
            Suggestions are just shortcuts — type anything (e.g. &ldquo;Quant
            Trader at a prop shop&rdquo;).
          </span>
          {validation.errors.target_role && value.target_role.length > 0 && (
            <span className="text-xs text-clay">
              {validation.errors.target_role}
            </span>
          )}
        </label>

        <label htmlFor={companyId} className="flex flex-col gap-1.5">
          <span className="text-xs text-driftwood">Company <span className="text-driftwood/60">(optional)</span></span>
          <input
            id={companyId}
            type="text"
            value={value.target_company}
            onChange={(e) =>
              onChange({ ...value, target_company: e.target.value })
            }
            placeholder="Google (optional)"
            disabled={disabled}
            className="rounded-lg border border-bone bg-vellum/50 px-3 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20 disabled:opacity-50"
          />
          {validation.errors.target_company && value.target_company.length > 0 && (
            <span className="text-xs text-clay">
              {validation.errors.target_company}
            </span>
          )}
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2.5 cursor-pointer group">
        <input
          type="checkbox"
          checked={value.is_internship}
          onChange={(e) =>
            onChange({ ...value, is_internship: e.target.checked })
          }
          disabled={disabled}
          className="mt-0.5 h-4 w-4 rounded border-bone text-ink focus:ring-thistle/30 disabled:opacity-50"
        />
        <span className="flex flex-col gap-0.5 text-[12px] text-driftwood/90 leading-relaxed">
          <span className="font-medium text-ink">Applying to an internship</span>
          <span className="text-driftwood/80">
            Recalibrates the 4 recruiter-AIs to a student / new-grad funnel
            — coursework, clubs, and short experiences count as signal, and
            absence of full-time roles isn&apos;t flagged as a gap.
          </span>
        </span>
      </label>

      <p className="mt-4 text-[12px] text-driftwood/80 leading-relaxed">
        The fit query asks each LLM how well your resume reads against this
        target. Company is optional — leave it blank for a role-only read.
        Be honest with the role — &ldquo;dream stretch&rdquo; targets just
        produce harsher feedback.
      </p>

      <div className="mt-6 pt-5 border-t border-bone">
        <label htmlFor={jdId} className="flex flex-col gap-1.5">
          <span className="text-xs text-driftwood">
            Job description <span className="text-driftwood/60">(optional)</span>
          </span>
          <textarea
            id={jdId}
            value={value.target_jd}
            onChange={(e) => onChange({ ...value, target_jd: e.target.value })}
            placeholder="Paste the JD text here, or upload an image →"
            rows={6}
            maxLength={JD_MAX + 100}
            disabled={disabled || jdImageStatus === 'extracting'}
            className="rounded-lg border border-bone bg-vellum/50 px-3 py-2.5 text-sm font-mono leading-relaxed focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20 disabled:opacity-50 resize-y"
          />
        </label>

        <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => jdImageInputRef.current?.click()}
              disabled={disabled || jdImageStatus === 'extracting'}
              className="text-driftwood underline hover:text-ink disabled:opacity-50"
            >
              {jdImageStatus === 'extracting' ? 'Reading image…' : 'Upload an image instead'}
            </button>
            <input
              ref={jdImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleJdImage(file)
                e.target.value = ''
              }}
            />
            {jdImageStatus === 'error' && (
              <span className="text-clay">{jdImageError}</span>
            )}
          </div>
          <span className={jdLength > JD_MAX ? 'text-clay' : 'text-driftwood/60'}>
            {jdLength.toLocaleString()} / {JD_MAX.toLocaleString()}
          </span>
        </div>

        {validation.errors.target_jd && jdLength > 0 && (
          <p className="mt-2 text-xs text-clay">{validation.errors.target_jd}</p>
        )}

        <p className="mt-3 text-[12px] text-driftwood/80 leading-relaxed">
          When provided, the &ldquo;fit&rdquo;, &ldquo;top strengths&rdquo;, and
          &ldquo;missing signal&rdquo; questions read your resume directly
          against this JD&apos;s requirements. Image upload OCR&apos;s the JD
          and drops it into the box for you to confirm or edit.
        </p>
      </div>
    </div>
  )
}
