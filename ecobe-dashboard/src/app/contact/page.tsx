import { ContactForm } from '@/components/contact/ContactForm'

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200">
            Contact CO2 Router
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
              Route the first production conversation through a real system.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
              Use this channel for design-partner outreach, deployment support, or security reporting.
              Messages route through the production mail pipeline to the operating inbox.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Sales</div>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                Design partners, pilot scoping, and execution-governance rollout.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Support</div>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                Runtime issues, adapter integration, and live control-surface troubleshooting.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Security</div>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                Responsible disclosure, operational trust concerns, and provenance questions.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-6">
          <div className="space-y-3 pb-5">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
              Active routing
            </div>
            <h2 className="text-2xl font-bold text-white">Production mail path</h2>
            <p className="text-sm leading-7 text-slate-300">
              Messages submit to a server-side route, validate, rate-limit, and deliver through Resend
              to the operating inbox without exposing transport credentials.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>
    </div>
  )
}
