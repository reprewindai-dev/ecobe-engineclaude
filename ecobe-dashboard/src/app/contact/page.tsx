import Link from 'next/link'

export default function ContactPage() {
  const contacts = [
    {
      label: 'Sales',
      value: 'sales@co2router.com',
      detail: 'Commercial evaluation, enterprise rollout, and category briefings.',
    },
    {
      label: 'Support',
      value: 'support@co2router.com',
      detail: 'Operational issues, integration debugging, and customer help.',
    },
    {
      label: 'Security',
      value: 'security@co2router.com',
      detail: 'Responsible disclosure, incident coordination, and trust issues.',
    },
  ]

  return (
    <div className="space-y-8 pb-8">
      <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_36%),linear-gradient(180deg,rgba(5,10,20,0.96),rgba(2,8,18,0.98))] p-6 sm:p-8 lg:p-10">
        <div className="max-w-4xl">
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Contact</div>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
            Talk to the team operating CO2 Router.
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-8 text-slate-300 sm:text-base">
            Use the channel that matches the job. If you are evaluating the platform, include your
            workload type, expected execution footprint, and whether you need CI, control-surface,
            or enforcement rollout support.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/console"
              className="rounded-2xl bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950"
            >
              Open Control Surface
            </Link>
            <Link
              href="/methodology"
              className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white"
            >
              Read methodology
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {contacts.map((contact) => (
          <article
            key={contact.label}
            className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6"
          >
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{contact.label}</div>
            <div className="mt-3 text-xl font-bold text-white">{contact.value}</div>
            <p className="mt-4 text-sm leading-7 text-slate-300">{contact.detail}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
