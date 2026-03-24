import { Router } from 'express'
import { access, readFile } from 'fs/promises'
import path from 'path'
import { env } from '../config/env'
import { getIntegrationMetricsSummary, computeIntegrationSuccessRate } from '../lib/integration-metrics'
import {
  ASSURANCE_DISAGREEMENT_THRESHOLD_PCT,
  ASSURANCE_MODE_SUMMARY,
  DEFAULT_ROUTING_WEIGHTS,
  LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE,
  METHODOLOGY_TIERS,
  POLICY_MODES,
  ROUTING_LEGAL_DISCLAIMER,
  STANDARDS_MAPPING,
} from '../lib/methodology'

const router = Router()

type ProviderConfig = {
  name: string
  source: string
  enabled: boolean
}

type IntegrationMetricRecord = {
  source: string
  successCount: number
  failureCount: number
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  lastLatencyMs: number | null
  alertActive: boolean
}

const SIGNAL_PROFILES = [
  {
    id: 'us_official',
    description: 'Uses assurance-safe average operational signals from EIA-930, ISO telemetry, GridStatus, and Ember validation.',
    signalTypes: ['average_operational'],
    policyMode: 'sec_disclosure_strict',
  },
  {
    id: 'forecast_research',
    description: 'Uses forecast and structural validation layers for low-carbon scheduling over a broader time horizon.',
    signalTypes: ['average_operational', 'consumed_emissions'],
    policyMode: 'eu_24x7_ready',
  },
  {
    id: 'marginal_when_available',
    description: 'Allows marginal estimates such as WattTime MOER when the provider/router supports them.',
    signalTypes: ['marginal_estimate', 'average_operational'],
    policyMode: 'default',
  },
] as const

function buildCapabilities() {
  return {
    routingModes: ['optimize', 'assurance'],
    policyModes: POLICY_MODES,
    signalTypes: ['average_operational', 'marginal_estimate', 'consumed_emissions'],
    signalProfiles: SIGNAL_PROFILES,
    disclosure: {
      exportFormats: ['json', 'csv'],
      batchEndpoint: '/api/v1/disclosure/batches',
      exportEndpoint: '/api/v1/disclosure/export',
      signedBatches: Boolean(env.DISCLOSURE_EXPORT_SIGNING_SECRET),
      orgScopedExports: true,
      globalExports: true,
    },
    governance: {
      carbonBudgets: true,
      hardEnforcement: true,
      lowerHalfSlaTracking: true,
      policyEndpoint: '/api/v1/carbon-ledger/policies',
      evaluationEndpoint: '/api/v1/carbon-ledger/policies/:orgId/evaluate',
    },
    ci: {
      routeEndpoint: '/api/v1/ci/route',
      reusableWorkflowTemplates: true,
      concurrencyProfiles: true,
      budgetAwareDeferral: true,
    },
    providers: PROVIDERS.map((provider) => ({
      name: provider.name,
      source: provider.source,
      enabled: provider.enabled,
    })),
  }
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'WattTime',
    source: 'WATTTIME',
    enabled: Boolean(env.WATTTIME_USERNAME && env.WATTTIME_PASSWORD),
  },
  {
    name: 'GridStatus EIA-930',
    source: 'GRIDSTATUS',
    enabled: Boolean(env.GRIDSTATUS_API_KEY || env.EIA_API_KEY),
  },
  {
    name: 'Ember',
    source: 'EMBER',
    enabled: Boolean(env.EMBER_API_KEY),
  },
  {
    name: 'GB Carbon Intensity',
    source: 'GB_CARBON',
    enabled: true,
  },
  {
    name: 'DK Carbon',
    source: 'DK_CARBON',
    enabled: true,
  },
  {
    name: 'FI Carbon',
    source: 'FI_CARBON',
    enabled: Boolean(env.FINGRID_API_KEY),
  },
]

async function readMethodologyMarkdown() {
  const candidatePaths = [
    path.resolve(process.cwd(), 'METHODOLOGY.md'),
    path.resolve(process.cwd(), 'ecobe-engine', 'ecobe-engine', 'METHODOLOGY.md'),
    path.resolve(__dirname, '../../METHODOLOGY.md'),
    path.resolve(__dirname, '../../ecobe-engine/ecobe-engine/METHODOLOGY.md'),
  ]

  for (const candidatePath of candidatePaths) {
    try {
      await access(candidatePath)
      return readFile(candidatePath, 'utf8')
    } catch {
      continue
    }
  }

  throw new Error(`Methodology markdown not found in any known location: ${candidatePaths.join(', ')}`)
}

function getProviderStatus(metric?: {
  successCount: number
  failureCount: number
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  alertActive: boolean
}): 'healthy' | 'degraded' | 'offline' {
  if (!metric) return 'offline'

  const successRate = computeIntegrationSuccessRate(metric) ?? 0
  const hasSuccess = metric.successCount > 0

  if (!hasSuccess && metric.failureCount > 0) return 'offline'
  if (metric.alertActive || successRate < 0.8) return 'degraded'
  return 'healthy'
}

/**
 * GET /api/v1/methodology/providers
 * Returns live provider health for the dashboard methodology panel.
 */
router.get('/providers', async (_req, res) => {
  try {
    const metrics = (await getIntegrationMetricsSummary()) as IntegrationMetricRecord[]
    const bySource = new Map<string, IntegrationMetricRecord>(
      metrics.map((metric: IntegrationMetricRecord) => [metric.source, metric])
    )

    const providers = PROVIDERS.map((provider) => {
      const metric = bySource.get(provider.source)
      const status = provider.enabled ? getProviderStatus(metric) : 'offline'

      return {
        name: provider.name,
        status,
        latencyMs: metric?.lastLatencyMs != null ? Math.round(metric.lastLatencyMs) : null,
        lastSuccessAt: metric?.lastSuccessAt?.toISOString() ?? null,
        disagreementPct: null,
      }
    })

    res.json({ providers })
  } catch (error) {
    console.error('Methodology providers error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/capabilities', async (_req, res) => {
  try {
    return res.json(buildCapabilities())
  } catch (error) {
    console.error('Methodology capabilities error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/', async (_req, res) => {
  try {
    const markdown = await readMethodologyMarkdown()

    return res.json({
      title: 'Ecobe Methodology',
      slug: 'lowest-defensible-signal',
      lastUpdated: '2026-03-23',
      doctrine: {
        name: 'Lowest Defensible Signal',
        summary: LOWEST_DEFENSIBLE_SIGNAL_DOCTRINE,
        legalDisclaimer: ROUTING_LEGAL_DISCLAIMER,
      },
      scoring: {
        formula:
          'score = w_carbon * carbon_score + w_latency * latency_score + w_cost * cost_score',
        defaultWeights: DEFAULT_ROUTING_WEIGHTS,
      },
      assuranceMode: {
        summary: ASSURANCE_MODE_SUMMARY,
        disagreementThresholdPct: ASSURANCE_DISAGREEMENT_THRESHOLD_PCT,
        exportPath: '/api/v1/disclosure/export',
        signedBatches: Boolean(env.DISCLOSURE_EXPORT_SIGNING_SECRET),
      },
      policyModes: POLICY_MODES,
      standardsMapping: STANDARDS_MAPPING,
      tiers: METHODOLOGY_TIERS,
      capabilities: buildCapabilities(),
      markdown,
    })
  } catch (error) {
    console.error('Methodology card error:', error)
    return res.status(500).json({ error: 'Failed to load methodology' })
  }
})

router.get('/markdown', async (_req, res) => {
  try {
    const markdown = await readMethodologyMarkdown()
    res.type('text/markdown')
    return res.send(markdown)
  } catch (error) {
    console.error('Methodology markdown error:', error)
    return res.status(500).send('Failed to load methodology')
  }
})

export default router
