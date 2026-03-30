const faqs = [
  {
    q: 'Is CO2 Router a dashboard?',
    a: 'No. The dashboard is a read layer over the engine. The product is the pre-execution authorization control plane.',
  },
  {
    q: 'Is the engine live in production?',
    a: 'Yes. The engine is deployed on Railway and is storing canonical decision frames in production.',
  },
  {
    q: 'Is assurance fully closed?',
    a: 'Not yet. The product is operational, but full assurance closure is still in progress because source provenance is not fully verified for every water dataset.',
  },
  {
    q: 'What are the strongest production wedges today?',
    a: 'CI/CD and Kubernetes. Those are the most credible, mature enforcement paths in the product today.',
  },
] as const

export default function FaqPage() {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">FAQ</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Direct answers for technical buyers.</h1>
      </section>

      <section className="grid gap-6">
        {faqs.map((faq) => (
          <div key={faq.q} className="surface-card p-6">
            <div className="text-xl font-semibold text-white">{faq.q}</div>
            <p className="mt-4 text-base leading-7 text-slate-300">{faq.a}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
