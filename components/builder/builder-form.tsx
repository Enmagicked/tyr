'use client'

import { useId } from 'react'
import type {
  BuilderInput,
  BuilderInputEducation,
  BuilderInputExperience,
  BuilderInputProject,
  BuilderInputActivity,
} from '@/lib/builder/types'

interface BuilderFormProps {
  value: BuilderInput
  onChange: (next: BuilderInput) => void
  disabled?: boolean
}

const inputCls =
  'rounded-lg border border-bone bg-vellum/50 px-3 py-2 text-sm focus:outline-none focus:border-ink/40 focus:ring-2 focus:ring-thistle/20 disabled:opacity-50'
const labelCls = 'flex flex-col gap-1.5 text-xs text-driftwood'

function emptyExperience(): BuilderInputExperience {
  return { role: '', org: '', dates: '', location: '', description: '' }
}
function emptyProject(): BuilderInputProject {
  return { name: '', tech: '', link: '', description: '' }
}
function emptyEducation(): BuilderInputEducation {
  return { school: '', degree: '', field: '', graduation: '', gpa: '', coursework: '', honors: '' }
}
function emptyActivity(): BuilderInputActivity {
  return { name: '', role: '', dates: '', description: '' }
}

export function BuilderForm({ value, onChange, disabled }: BuilderFormProps) {
  const id = useId()

  function setContact(patch: Partial<BuilderInput['contact']>) {
    onChange({ ...value, contact: { ...value.contact, ...patch } })
  }
  function setList<K extends 'experiences' | 'projects' | 'education' | 'activities'>(
    key: K,
    next: BuilderInput[K]
  ) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="space-y-8">
      {/* Contact */}
      <section className="rounded-2xl border border-bone bg-paper p-6 md:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-4">
          Contact
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={labelCls}>
            <span>Full name</span>
            <input
              type="text"
              value={value.contact.name}
              onChange={(e) => setContact({ name: e.target.value })}
              placeholder="Jane Doe"
              disabled={disabled}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span>Email</span>
            <input
              type="email"
              value={value.contact.email}
              onChange={(e) => setContact({ email: e.target.value })}
              placeholder="jane@email.com"
              disabled={disabled}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span>Phone <span className="text-driftwood/60">(optional)</span></span>
            <input
              type="tel"
              value={value.contact.phone ?? ''}
              onChange={(e) => setContact({ phone: e.target.value })}
              disabled={disabled}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            <span>Location <span className="text-driftwood/60">(optional)</span></span>
            <input
              type="text"
              value={value.contact.location ?? ''}
              onChange={(e) => setContact({ location: e.target.value })}
              placeholder="Brooklyn, NY"
              disabled={disabled}
              className={inputCls}
            />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            <span>Links <span className="text-driftwood/60">(optional)</span></span>
            <input
              type="text"
              value={value.contact.links ?? ''}
              onChange={(e) => setContact({ links: e.target.value })}
              placeholder="linkedin.com/in/jane · github.com/jane · janedoe.com"
              disabled={disabled}
              className={inputCls}
            />
          </label>
        </div>
      </section>

      {/* Education */}
      <RepeatableSection
        title="Education"
        items={value.education}
        emptyItem={emptyEducation}
        onChange={(next) => setList('education', next)}
        disabled={disabled}
        renderItem={(item, set) => (
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelCls}>
              <span>School</span>
              <input
                type="text"
                value={item.school}
                onChange={(e) => set({ school: e.target.value })}
                placeholder="Yale University"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Degree</span>
              <input
                type="text"
                value={item.degree ?? ''}
                onChange={(e) => set({ degree: e.target.value })}
                placeholder="B.S."
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Field</span>
              <input
                type="text"
                value={item.field ?? ''}
                onChange={(e) => set({ field: e.target.value })}
                placeholder="Computer Science"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Graduation</span>
              <input
                type="text"
                value={item.graduation ?? ''}
                onChange={(e) => set({ graduation: e.target.value })}
                placeholder="May 2026"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>GPA</span>
              <input
                type="text"
                value={item.gpa ?? ''}
                onChange={(e) => set({ gpa: e.target.value })}
                placeholder="3.9 / 4.0"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Honors</span>
              <input
                type="text"
                value={item.honors ?? ''}
                onChange={(e) => set({ honors: e.target.value })}
                placeholder="summa cum laude, Phi Beta Kappa"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={`${labelCls} md:col-span-2`}>
              <span>Relevant coursework</span>
              <input
                type="text"
                value={item.coursework ?? ''}
                onChange={(e) => set({ coursework: e.target.value })}
                placeholder="Algorithms, Operating Systems, Distributed Systems, ML"
                disabled={disabled}
                className={inputCls}
              />
            </label>
          </div>
        )}
      />

      {/* Experience */}
      <RepeatableSection
        title="Experience"
        items={value.experiences}
        emptyItem={emptyExperience}
        onChange={(next) => setList('experiences', next)}
        disabled={disabled}
        renderItem={(item, set) => (
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelCls}>
              <span>Role</span>
              <input
                type="text"
                value={item.role}
                onChange={(e) => set({ role: e.target.value })}
                placeholder="Software Engineer Intern"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Organization</span>
              <input
                type="text"
                value={item.org}
                onChange={(e) => set({ org: e.target.value })}
                placeholder="Stripe"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Dates</span>
              <input
                type="text"
                value={item.dates ?? ''}
                onChange={(e) => set({ dates: e.target.value })}
                placeholder="Jun 2024 — Aug 2024"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Location</span>
              <input
                type="text"
                value={item.location ?? ''}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="South San Francisco, CA"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={`${labelCls} md:col-span-2`}>
              <span>What you did + impact</span>
              <textarea
                value={item.description}
                onChange={(e) => set({ description: e.target.value })}
                rows={4}
                placeholder="Built a tool that cut p99 latency from 800ms to 120ms. Owned the migration of the payment retry service to async workers (handled 30k events/day). Mentored two new interns."
                disabled={disabled}
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </label>
          </div>
        )}
      />

      {/* Projects */}
      <RepeatableSection
        title="Projects"
        items={value.projects}
        emptyItem={emptyProject}
        onChange={(next) => setList('projects', next)}
        disabled={disabled}
        renderItem={(item, set) => (
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelCls}>
              <span>Name</span>
              <input
                type="text"
                value={item.name}
                onChange={(e) => set({ name: e.target.value })}
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Tech / stack</span>
              <input
                type="text"
                value={item.tech ?? ''}
                onChange={(e) => set({ tech: e.target.value })}
                placeholder="Rust, Postgres, Kafka"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={`${labelCls} md:col-span-2`}>
              <span>Link</span>
              <input
                type="text"
                value={item.link ?? ''}
                onChange={(e) => set({ link: e.target.value })}
                placeholder="github.com/jane/project"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={`${labelCls} md:col-span-2`}>
              <span>Description</span>
              <textarea
                value={item.description}
                onChange={(e) => set({ description: e.target.value })}
                rows={3}
                placeholder="What it does, what was technically interesting, anything quantitative (stars, users, perf)."
                disabled={disabled}
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </label>
          </div>
        )}
      />

      {/* Activities */}
      <RepeatableSection
        title="Activities & leadership"
        items={value.activities}
        emptyItem={emptyActivity}
        onChange={(next) => setList('activities', next)}
        disabled={disabled}
        renderItem={(item, set) => (
          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelCls}>
              <span>Organization / activity</span>
              <input
                type="text"
                value={item.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Yale Computer Society"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Role</span>
              <input
                type="text"
                value={item.role ?? ''}
                onChange={(e) => set({ role: e.target.value })}
                placeholder="President"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span>Dates</span>
              <input
                type="text"
                value={item.dates ?? ''}
                onChange={(e) => set({ dates: e.target.value })}
                placeholder="2023 — present"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className={`${labelCls} md:col-span-2`}>
              <span>What you did</span>
              <textarea
                value={item.description}
                onChange={(e) => set({ description: e.target.value })}
                rows={3}
                placeholder="Ran weekly tech talks, grew membership 30→120, organized a hackathon with $5K in sponsorships."
                disabled={disabled}
                className={`${inputCls} resize-y leading-relaxed`}
              />
            </label>
          </div>
        )}
      />

      {/* Skills */}
      <section className="rounded-2xl border border-bone bg-paper p-6 md:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-4">
          Skills
        </p>
        <label className={labelCls}>
          <span>Languages, tools, frameworks</span>
          <textarea
            id={`${id}-skills`}
            value={value.skills}
            onChange={(e) => onChange({ ...value, skills: e.target.value })}
            rows={3}
            placeholder="Languages: Python, Go, TypeScript, Rust. Tools: Postgres, Redis, Kafka, Docker, GCP. Frameworks: React, Next.js, FastAPI."
            disabled={disabled}
            className={`${inputCls} resize-y leading-relaxed`}
          />
        </label>
      </section>

      {/* Awards */}
      <section className="rounded-2xl border border-bone bg-paper p-6 md:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood mb-4">
          Awards <span className="text-driftwood/60 normal-case font-normal">(optional)</span>
        </p>
        <label className={labelCls}>
          <textarea
            value={value.awards ?? ''}
            onChange={(e) => onChange({ ...value, awards: e.target.value })}
            rows={2}
            placeholder="USACO Platinum (2022). Putnam top 200 (2023). Goldwater Scholar (2024)."
            disabled={disabled}
            className={`${inputCls} resize-y leading-relaxed`}
          />
        </label>
      </section>
    </div>
  )
}

// Generic repeatable-section component
interface RepeatableSectionProps<T> {
  title: string
  items: T[]
  emptyItem: () => T
  renderItem: (item: T, set: (patch: Partial<T>) => void) => React.ReactNode
  onChange: (next: T[]) => void
  disabled?: boolean
}

function RepeatableSection<T>({
  title,
  items,
  emptyItem,
  renderItem,
  onChange,
  disabled,
}: RepeatableSectionProps<T>) {
  return (
    <section className="rounded-2xl border border-bone bg-paper p-6 md:p-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-driftwood">
          {title}
        </p>
        <button
          type="button"
          onClick={() => onChange([...items, emptyItem()])}
          disabled={disabled}
          className="text-[12px] font-medium text-driftwood hover:text-ink underline disabled:opacity-50"
        >
          + Add
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-driftwood/70 italic">
          No entries yet — click &ldquo;+ Add&rdquo; to start.
        </p>
      ) : (
        <div className="space-y-6">
          {items.map((item, i) => (
            <div key={i} className="border-t border-bone pt-5 first:border-t-0 first:pt-0">
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  disabled={disabled}
                  className="text-[11px] text-driftwood/70 hover:text-clay disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
              {renderItem(item, (patch) =>
                onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function emptyBuilderInput(): BuilderInput {
  return {
    contact: { name: '', email: '', phone: '', location: '', links: '' },
    education: [],
    experiences: [],
    projects: [],
    activities: [],
    skills: '',
    awards: '',
  }
}
