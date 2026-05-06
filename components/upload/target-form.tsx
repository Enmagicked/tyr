'use client'

import { useId } from 'react'
import {
  COMMON_ROLES,
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
  const validation = validateTarget(value)

  return (
    <div className="rounded-2xl border border-bone bg-paper p-6 md:p-8">
      <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-5">
        Target
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor={roleId} className="flex flex-col gap-1.5">
          <span className="text-xs text-driftwood">Role</span>
          <input
            id={roleId}
            list={`${roleId}-list`}
            type="text"
            value={value.target_role}
            onChange={(e) =>
              onChange({ ...value, target_role: e.target.value })
            }
            placeholder="Software Engineer"
            disabled={disabled}
            className="rounded-lg border border-bone bg-vellum/50 px-3 py-2.5 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20 disabled:opacity-50"
          />
          <datalist id={`${roleId}-list`}>
            {COMMON_ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          {validation.errors.target_role && value.target_role.length > 0 && (
            <span className="text-xs text-clay">
              {validation.errors.target_role}
            </span>
          )}
        </label>

        <label htmlFor={companyId} className="flex flex-col gap-1.5">
          <span className="text-xs text-driftwood">Company</span>
          <input
            id={companyId}
            type="text"
            value={value.target_company}
            onChange={(e) =>
              onChange({ ...value, target_company: e.target.value })
            }
            placeholder="Google"
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

      <p className="mt-4 text-[12px] text-driftwood/80 leading-relaxed">
        The fit query asks each LLM how well your resume reads against this
        specific target. Be honest — &ldquo;dream stretch&rdquo; targets just
        produce harsher feedback.
      </p>
    </div>
  )
}
