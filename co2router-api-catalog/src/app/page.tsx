export const dynamic = 'force-dynamic'

type ApiCatalogMethod = 'GET' | 'POST'

type ApiCatalogEndpoint = {
  id: string
  method: ApiCatalogMethod
  path: string
  canonical: boolean
  audience: 'public' | 'internal'
  category:
    | 'authorization'
    | 'signals'
    | 'proof'
    | 'ledger'
    | 'water'
    | 'operations'
    | 'ingest'
  summary: string
  compatibility?: string[]
}

type ApiCatalogAdapterProfile = {
  id: string
  runtime: string
  entrypoint: string
  summary: string
}

type ApiCatalogDocument = {
  product: {
    name: string
    version: string
    canonicalBaseUrl: string
    doctrine: string
  }
  publishedAt: string
  integrationPromise: {
    inbound: string
    outbound: string
  }
  endpoints: ApiCatalogEndpoint[]
  adapterProfiles: ApiCatalogAdapterProfile[]
}

const DEFAULT_ENGINE_URL = 'https://ecobe-engineclaude-production.up.railway.app'

async function getCatalog(): Promise<ApiCatalogDocument> {
  const engineUrl = (process.env.ECOBE_ENGINE_URL || DEFAULT_ENGINE_URL).replace(/\/+$/, '')
  const response = await fetch(`${engineUrl}/api/v1/system/api-catalog`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Failed to load API catalog: ${response.status}`)
  }

  return response.json()
}

function badgeColor(endpoint: ApiCatalogEndpoint) {
  if (endpoint.canonical) return '#22c55e'
  if (endpoint.category === 'proof') return '#8b5cf6'
  if (endpoint.category === 'signals') return '#06b6d4'
  if (endpoint.category === 'ledger') return '#f59e0b'
  return '#64748b'
}

export default async function Home() {
  const catalog = await getCatalog()
  const canonicalCount = catalog.endpoints.filter((endpoint) => endpoint.canonical).length
  const publicCount = catalog.endpoints.filter((endpoint) => endpoint.audience === 'public').length

  return (
    <div className="min-h-screen bg-[#030706] text-[#e2ebe8]">
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#22c55e]/20 bg-[#22c55e]/5 px-3 py-1.5 font-mono text-xs text-[#22c55e]">
          Live contract
          <span className="text-[#556663]">{catalog.product.version}</span>
        </div>

        <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight">
          One router contract.
          <br />
          Zero customer codebase rewrites.
        </h1>

        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[#8a9e9a]">
          This catalog is rendered from the engine&apos;s canonical API document, not from hand-maintained copy.
          External adopters integrate once against the canonical surface. Compatibility aliases stay published
          explicitly instead of living as hidden tribal knowledge.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#1a2826] bg-[#080c0b] p-5">
            <div className="font-mono text-xs uppercase tracking-[0.12em] text-[#556663]">Canonical endpoints</div>
            <div className="mt-3 text-3xl font-bold text-[#22c55e]">{canonicalCount}</div>
          </div>
          <div className="rounded-2xl border border-[#1a2826] bg-[#080c0b] p-5">
            <div className="font-mono text-xs uppercase tracking-[0.12em] text-[#556663]">Public surface</div>
            <div className="mt-3 text-3xl font-bold text-[#06b6d4]">{publicCount}</div>
          </div>
          <div className="rounded-2xl border border-[#1a2826] bg-[#080c0b] p-5">
            <div className="font-mono text-xs uppercase tracking-[0.12em] text-[#556663]">Published at</div>
            <div className="mt-3 text-base font-medium text-[#e2ebe8]">{new Date(catalog.publishedAt).toLocaleString()}</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#1a2826] bg-[#080c0b] p-6">
            <div className="font-mono text-xs uppercase tracking-[0.12em] text-[#556663]">Inbound promise</div>
            <p className="mt-4 text-sm leading-7 text-[#8a9e9a]">{catalog.integrationPromise.inbound}</p>
          </div>
          <div className="rounded-2xl border border-[#1a2826] bg-[#080c0b] p-6">
            <div className="font-mono text-xs uppercase tracking-[0.12em] text-[#556663]">Outbound promise</div>
            <p className="mt-4 text-sm leading-7 text-[#8a9e9a]">{catalog.integrationPromise.outbound}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 font-mono text-xs uppercase tracking-[0.12em] text-[#556663]">Endpoints</div>
        <div className="space-y-4">
          {catalog.endpoints.map((endpoint) => {
            const color = badgeColor(endpoint)
            return (
              <div key={endpoint.id} className="rounded-2xl border border-[#1a2826] bg-[#080c0b] p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="rounded px-2 py-1 font-mono text-xs font-bold"
                    style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}
                  >
                    {endpoint.method}
                  </span>
                  <code className="font-mono text-sm text-[#e2ebe8]">{endpoint.path}</code>
                  <span className="rounded border border-[#1a2826] px-2 py-1 font-mono text-[11px] text-[#8a9e9a]">
                    {endpoint.canonical ? 'canonical' : 'compatibility'}
                  </span>
                  <span className="rounded border border-[#1a2826] px-2 py-1 font-mono text-[11px] text-[#8a9e9a]">
                    {endpoint.audience}
                  </span>
                  <span className="rounded border border-[#1a2826] px-2 py-1 font-mono text-[11px] text-[#8a9e9a]">
                    {endpoint.category}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-7 text-[#8a9e9a]">{endpoint.summary}</p>

                {endpoint.compatibility?.length ? (
                  <div className="mt-4">
                    <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#556663]">Aliases / migration paths</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {endpoint.compatibility.map((path) => (
                        <code key={path} className="rounded border border-[#1a2826] bg-[#030706] px-2 py-1 font-mono text-xs text-[#8a9e9a]">
                          {path}
                        </code>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 font-mono text-xs uppercase tracking-[0.12em] text-[#556663]">Adapter profiles</div>
        <div className="grid gap-4 md:grid-cols-3">
          {catalog.adapterProfiles.map((profile) => (
            <div key={profile.id} className="rounded-2xl border border-[#1a2826] bg-[#080c0b] p-6">
              <div className="font-mono text-xs uppercase tracking-[0.12em] text-[#22c55e]">{profile.runtime}</div>
              <h2 className="mt-3 text-lg font-bold">{profile.id}</h2>
              <code className="mt-3 block font-mono text-xs text-[#8a9e9a]">{profile.entrypoint}</code>
              <p className="mt-4 text-sm leading-7 text-[#8a9e9a]">{profile.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
