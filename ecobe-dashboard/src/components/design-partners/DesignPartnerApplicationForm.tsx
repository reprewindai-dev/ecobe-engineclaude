'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'

import { ecobeApi } from '@/lib/api'
import { designPartnerContactEmail } from '@/lib/design-partner-program'
import type { DesignPartnerApplicationPayload, DesignPartnerRecord } from '@/types'

type FormState = {
  companyName: string
  companyDomain: string
  teamName: string
  teamType: DesignPartnerApplicationPayload['teamType']
  applicantName: string
  applicantEmail: string
  roleTitle: string
  mainWorkloadsPlatforms: string
  goalsSummary: string
  scopedWorkflow: string
  internalChampion: string
  commercialApprover: string
  commitmentConfirmed: boolean
  anonymizedProofPermission: boolean
  website: string
}

const initialForm: FormState = {
  companyName: '',
  companyDomain: '',
  teamName: '',
  teamType: 'platform',
  applicantName: '',
  applicantEmail: '',
  roleTitle: '',
  mainWorkloadsPlatforms: '',
  goalsSummary: '',
  scopedWorkflow: '',
  internalChampion: '',
  commercialApprover: '',
  commitmentConfirmed: false,
  anonymizedProofPermission: false,
  website: '',
}

export function DesignPartnerApplicationForm() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [error, setError] = useState<string | null>(null)
  const [submittedPartner, setSubmittedPartner] = useState<DesignPartnerRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!form.commitmentConfirmed || !form.anonymizedProofPermission) {
      setError(
        'The pilot requires a scoped 3-month commitment and permission for anonymized results if it succeeds.'
      )
      return
    }

    setIsSubmitting(true)

    try {
      const payload: DesignPartnerApplicationPayload = {
        companyName: form.companyName,
        companyDomain: form.companyDomain || null,
        teamName: form.teamName || null,
        teamType: form.teamType,
        applicantName: form.applicantName,
        applicantEmail: form.applicantEmail,
        roleTitle: form.roleTitle,
        mainWorkloadsPlatforms: form.mainWorkloadsPlatforms,
        goalsSummary: form.goalsSummary,
        scopedWorkflow: form.scopedWorkflow,
        internalChampion: form.internalChampion,
        commercialApprover: form.commercialApprover || null,
        commitmentConfirmed: true,
        anonymizedProofPermission: true,
        website: form.website,
      }

      const response = await ecobeApi.applyForDesignPartnerProgram(payload)
      setSubmittedPartner(response.partner)
      setForm(initialForm)
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Unable to submit design partner application'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_320px]">
      <form
        onSubmit={handleSubmit}
        className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
              Apply For The Pilot
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
              Submit one real workflow, not a general note.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              This intake is reviewed directly against pilot fit, workflow clarity, operator
              ownership, and commercial readiness. The goal is fast qualification, fast
              activation, and a clean decision on a paid continuation path by the end of the
              pilot.
            </p>
          </div>
          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-emerald-200">
            capped cohort
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Field
            label="Company"
            value={form.companyName}
            onChange={(value) => updateField('companyName', value)}
            placeholder="Example: Acme Cloud"
            required
          />
          <Field
            label="Company domain"
            value={form.companyDomain}
            onChange={(value) => updateField('companyDomain', value)}
            placeholder="acme.com"
          />
          <Field
            label="Your name"
            value={form.applicantName}
            onChange={(value) => updateField('applicantName', value)}
            placeholder="Full name"
            required
          />
          <Field
            label="Work email"
            value={form.applicantEmail}
            onChange={(value) => updateField('applicantEmail', value)}
            placeholder="name@company.com"
            required
            type="email"
          />
          <Field
            label="Role"
            value={form.roleTitle}
            onChange={(value) => updateField('roleTitle', value)}
            placeholder="Platform Engineering Manager"
            required
          />
          <Field
            label="Team"
            value={form.teamName}
            onChange={(value) => updateField('teamName', value)}
            placeholder="Platform Operations"
          />
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Team type
            </label>
            <select
              value={form.teamType}
              onChange={(event) => updateField('teamType', event.target.value as FormState['teamType'])}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
            >
              <option value="infra">Infra</option>
              <option value="platform">Platform</option>
              <option value="sre">SRE</option>
              <option value="data">Data</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Field
            label="Champion / commercial approver"
            value={form.commercialApprover}
            onChange={(value) => updateField('commercialApprover', value)}
            placeholder="Name or role for the person who can approve the next step"
          />
        </div>

        <div className="mt-4 grid gap-4">
          <TextAreaField
            label="Main workloads and platforms"
            value={form.mainWorkloadsPlatforms}
            onChange={(value) => updateField('mainWorkloadsPlatforms', value)}
            placeholder="GitHub Actions, scheduled ETL, batch retraining, preferred regions, cloud footprint, runner estate."
            required
          />
          <TextAreaField
            label="Goals around emissions, compliance, or infrastructure policy"
            value={form.goalsSummary}
            onChange={(value) => updateField('goalsSummary', value)}
            placeholder="Describe the pressure, policy, or operating risk that makes pre-execution control relevant."
            required
          />
          <TextAreaField
            label="Scoped pilot workflow"
            value={form.scopedWorkflow}
            onChange={(value) => updateField('scopedWorkflow', value)}
            placeholder="Name the exact workflow family you want governed in the pilot and what success looks like."
            required
          />
          <TextAreaField
            label="Internal champion"
            value={form.internalChampion}
            onChange={(value) => updateField('internalChampion', value)}
            placeholder="Who will own the pilot internally and drive the biweekly feedback loop?"
            required
          />
        </div>

        <input
          aria-hidden="true"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          value={form.website}
          onChange={(event) => updateField('website', event.target.value)}
          name="website"
        />

        <div className="mt-6 grid gap-3 text-sm text-slate-300">
          <label className="flex gap-3 rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.commitmentConfirmed}
              onChange={(event) => updateField('commitmentConfirmed', event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-cyan-300"
            />
            <span>
              We can commit to a scoped 3-month pilot, one workflow lane, biweekly product
              sessions, and a direct paid continuation conversation if value is proven.
            </span>
          </label>
          <label className="flex gap-3 rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.anonymizedProofPermission}
              onChange={(event) =>
                updateField('anonymizedProofPermission', event.target.checked)
              }
              className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950 text-cyan-300"
            />
            <span>
              If the pilot succeeds, we can permit anonymized case-study use. Named reference or
              logo use still requires explicit approval.
            </span>
          </label>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {submittedPartner ? (
          <div className="mt-6 rounded-[28px] border border-emerald-400/20 bg-emerald-400/10 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-200" />
              <div>
                <div className="text-sm font-semibold text-white">
                  Application recorded for {submittedPartner.companyName}.
                </div>
                <p className="mt-3 text-sm leading-7 text-emerald-50/90">
                  The next move is qualification against fit, one real workflow, and a clear
                  internal champion. If you need to add context immediately, send it to{' '}
                  {designPartnerContactEmail}.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit Application
          </button>
          <a
            href={`mailto:${designPartnerContactEmail}`}
            className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
          >
            Email Founder
          </a>
        </div>
      </form>

      <aside className="space-y-4 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,32,0.96),rgba(4,10,18,0.98))] p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-cyan-200">
          <ShieldCheck className="h-3.5 w-3.5" />
          Intake Gate
        </div>
        <div>
          <div className="text-lg font-bold text-white">What happens next</div>
          <div className="mt-3 text-sm leading-7 text-slate-300">
            Every application is reviewed against the locked phase-one wedge. The program is not a
            waitlist, not open-ended early access, and not a consulting queue.
          </div>
        </div>
        <div className="space-y-3 border-t border-white/10 pt-4 text-sm text-slate-300">
          <div className="flex items-start justify-between gap-4">
            <span>Intake posture</span>
            <span className="text-right text-cyan-200">scoped pilot qualification</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span>Fast-screen criteria</span>
            <span className="text-right">workflow, champion, scope, commercial path</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span>First-value target</span>
            <span className="text-right">within 30 days of acceptance</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span>Graduation motion</span>
            <span className="text-right">convert, strict extension, or close</span>
          </div>
        </div>
      </aside>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  required?: boolean
  type?: 'text' | 'email'
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
      />
    </div>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</label>
      <textarea
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-[24px] border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-cyan-300/60"
      />
    </div>
  )
}
