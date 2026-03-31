export function LegalDocument({
  title,
  summary,
  sections,
}: {
  title: string
  summary: string
  sections: Array<{
    heading: string
    body: string[]
  }>
}) {
  return (
    <div className="space-y-8 pb-10">
      <section className="surface-card-strong p-8">
        <div className="eyebrow">Legal baseline</div>
        <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">{summary}</p>
      </section>

      <section className="surface-card p-8">
        <div className="space-y-8">
          {sections.map((section) => (
            <div key={section.heading} className="space-y-3">
              <h2 className="text-xl font-semibold text-white">{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-7 text-slate-300">
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
