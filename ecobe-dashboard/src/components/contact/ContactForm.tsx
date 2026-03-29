'use client'

import { useState } from 'react'

import { CONTACT_CATEGORIES, type ContactCategory } from '@/lib/contact'

interface FormState {
  category: ContactCategory
  name: string
  email: string
  company: string
  message: string
  executionFootprint: string
  integrationSurface: string
  website: string
}

type SubmissionStatus =
  | { type: 'idle' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string; fieldErrors?: Record<string, string> }

const INITIAL_STATE: FormState = {
  category: 'sales',
  name: '',
  email: '',
  company: '',
  message: '',
  executionFootprint: '',
  integrationSurface: '',
  website: '',
}

export function ContactForm() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE)
  const [status, setStatus] = useState<SubmissionStatus>({ type: 'idle' })
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setStatus({ type: 'idle' })

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean
            message?: string
            errors?: Record<string, string>
          }
        | null

      if (!response.ok || !payload?.ok) {
        setStatus({
          type: 'error',
          message: payload?.message || 'Contact submission failed.',
          fieldErrors: payload?.errors,
        })
        return
      }

      setForm(INITIAL_STATE)
      setStatus({
        type: 'success',
        message: payload.message || 'Your message has been delivered.',
      })
    } catch {
      setStatus({
        type: 'error',
        message: 'Contact submission failed. Please try again shortly.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const fieldError = status.type === 'error' ? status.fieldErrors ?? {} : {}

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-3xl border border-cyan-500/20 bg-slate-950/70 p-6 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Category</span>
          <select
            value={form.category}
            onChange={(event) => updateField('category', event.target.value as ContactCategory)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
          >
            {CONTACT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </option>
            ))}
          </select>
          {fieldError.category ? <p className="text-xs text-rose-300">{fieldError.category}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Name</span>
          <input
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
            autoComplete="name"
          />
          {fieldError.name ? <p className="text-xs text-rose-300">{fieldError.name}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => updateField('email', event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
            autoComplete="email"
          />
          {fieldError.email ? <p className="text-xs text-rose-300">{fieldError.email}</p> : null}
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Company</span>
          <input
            value={form.company}
            onChange={(event) => updateField('company', event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
            autoComplete="organization"
          />
          {fieldError.company ? <p className="text-xs text-rose-300">{fieldError.company}</p> : null}
        </label>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Execution footprint</span>
          <input
            value={form.executionFootprint}
            onChange={(event) => updateField('executionFootprint', event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
            placeholder="GPU training, batch queues, CI runners"
          />
          {fieldError.executionFootprint ? (
            <p className="text-xs text-rose-300">{fieldError.executionFootprint}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Integration surface</span>
          <input
            value={form.integrationSurface}
            onChange={(event) => updateField('integrationSurface', event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
            placeholder="HTTP, CI/CD, Kubernetes, queues"
          />
          {fieldError.integrationSurface ? (
            <p className="text-xs text-rose-300">{fieldError.integrationSurface}</p>
          ) : null}
        </label>
      </div>

      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Message</span>
        <textarea
          value={form.message}
          onChange={(event) => updateField('message', event.target.value)}
          rows={7}
          className="w-full rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/60"
          placeholder="Describe the workloads you want CO2 Router to govern before execution."
        />
        {fieldError.message ? <p className="text-xs text-rose-300">{fieldError.message}</p> : null}
      </label>

      <label className="hidden">
        <span>Website</span>
        <input value={form.website} onChange={(event) => updateField('website', event.target.value)} tabIndex={-1} autoComplete="off" />
      </label>

      {status.type === 'success' ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {status.message}
        </div>
      ) : null}

      {status.type === 'error' ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {status.message}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs leading-relaxed text-slate-400">
          Contact mail is delivered through a server-only pipeline. No client-side secrets are exposed.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full border border-cyan-400/50 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Sending...' : 'Send request'}
        </button>
      </div>
    </form>
  )
}
