export type ApiCatalogMethod = 'GET' | 'POST'

export type ApiCatalogEndpoint = {
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

export type ApiCatalogAdapterProfile = {
  id: string
  runtime: string
  entrypoint: string
  summary: string
}

export type ApiCatalogDocument = {
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

const API_VERSION = '2026-04-04'

export function buildApiCatalogDocument(baseUrl: string): ApiCatalogDocument {
  return {
    product: {
      name: 'CO2 Router API',
      version: API_VERSION,
      canonicalBaseUrl: baseUrl.replace(/\/+$/, ''),
      doctrine: 'One canonical route per capability, with compatibility aliases published explicitly.',
    },
    publishedAt: new Date().toISOString(),
    integrationPromise: {
      inbound:
        'External systems can call a stable authorization, signal, proof, ledger, water, and status surface without changing their internal runtime code.',
      outbound:
        'CO2 Router can also plug into existing schedulers and CI runtimes through compatibility aliases and adapter profiles instead of bespoke per-customer forks.',
    },
    endpoints: [
      {
        id: 'ci-authorize',
        method: 'POST',
        path: '/api/v1/ci/authorize',
        canonical: true,
        audience: 'public',
        category: 'authorization',
        summary: 'Authorize a workload before execution and return a binding decision with proof metadata.',
        compatibility: ['/api/v1/ci/route', '/api/v1/ci/carbon-route'],
      },
      {
        id: 'ci-decisions',
        method: 'GET',
        path: '/api/v1/ci/decisions',
        canonical: true,
        audience: 'public',
        category: 'operations',
        summary: 'List recent authorization decisions and trace availability.',
      },
      {
        id: 'ci-replay',
        method: 'GET',
        path: '/api/v1/ci/decisions/:decisionFrameId/replay',
        canonical: true,
        audience: 'internal',
        category: 'proof',
        summary: 'Replay a decision deterministically against persisted canonical state.',
      },
      {
        id: 'ci-proof-json',
        method: 'GET',
        path: '/api/v1/ci/decisions/:decisionFrameId/proof-packet.json',
        canonical: true,
        audience: 'internal',
        category: 'proof',
        summary: 'Return the JSON proof packet for audit and compliance workflows.',
      },
      {
        id: 'grid-summary',
        method: 'GET',
        path: '/api/v1/intelligence/grid/summary',
        canonical: true,
        audience: 'public',
        category: 'signals',
        summary: 'Return current regional signal state for the routing plane.',
      },
      {
        id: 'carbon-ledger-job',
        method: 'GET',
        path: '/api/v1/carbon-ledger/job/:decisionFrameId',
        canonical: true,
        audience: 'public',
        category: 'ledger',
        summary: 'Return per-decision carbon accounting facts and savings attribution.',
      },
      {
        id: 'water-evidence',
        method: 'GET',
        path: '/api/v1/water/evidence/:decisionFrameId',
        canonical: true,
        audience: 'public',
        category: 'water',
        summary: 'Return water-evidence references and provenance for a governed decision.',
      },
      {
        id: 'system-status',
        method: 'GET',
        path: '/api/v1/system/status',
        canonical: true,
        audience: 'public',
        category: 'operations',
        summary: 'Return dependency, worker, outbox, and projection freshness status.',
      },
      {
        id: 'decision-ingest',
        method: 'POST',
        path: '/api/v1/decisions',
        canonical: true,
        audience: 'internal',
        category: 'ingest',
        summary: 'Ingest legacy or external decision events into canonical storage.',
      },
      {
        id: 'internal-routing-decisions',
        method: 'POST',
        path: '/api/v1/internal/routing-decisions',
        canonical: true,
        audience: 'internal',
        category: 'authorization',
        summary: 'Internal scheduler-facing routing decision contract for managed adapter flows.',
      },
      {
        id: 'legacy-route-wrapper',
        method: 'POST',
        path: '/api/v1/route',
        canonical: false,
        audience: 'public',
        category: 'authorization',
        summary: 'Legacy routing wrapper maintained for backwards compatibility.',
        compatibility: ['/api/v1/routing/green', '/api/v1/ci/authorize'],
      },
      {
        id: 'routing-green',
        method: 'POST',
        path: '/api/v1/routing/green',
        canonical: false,
        audience: 'public',
        category: 'authorization',
        summary: 'Legacy green-routing contract kept available while external adopters migrate to CI authorization.',
        compatibility: ['/api/v1/ci/authorize'],
      },
    ],
    adapterProfiles: [
      {
        id: 'http-gateway',
        runtime: 'generic-http',
        entrypoint: '/api/v1/ci/authorize',
        summary: 'Default external integration profile for direct pre-execution authorization.',
      },
      {
        id: 'github-actions',
        runtime: 'github_actions',
        entrypoint: '/api/v1/ci/authorize',
        summary: 'CI adapter profile for pre-job authorization and proof-backed execution gating.',
      },
      {
        id: 'internal-scheduler',
        runtime: 'scheduler',
        entrypoint: '/api/v1/internal/routing-decisions',
        summary: 'Managed internal adapter profile for scheduler-owned execution orchestration.',
      },
    ],
  }
}
