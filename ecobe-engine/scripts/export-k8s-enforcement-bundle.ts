import fs from 'fs'
import path from 'path'

import { buildKubernetesEnforcementPlan } from '../src/lib/enforcement/k8s-policy'

type Decision = 'run_now' | 'reroute' | 'delay' | 'throttle' | 'deny'
type Criticality = 'critical' | 'standard' | 'batch'
type PolicyProfile =
  | 'default'
  | 'drought_sensitive'
  | 'eu_data_center_reporting'
  | 'high_water_sensitivity'

function parseArgs(argv: string[]) {
  const args = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) {
      continue
    }

    const key = current.slice(2)
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : 'true'
    args.set(key, value)

    if (value !== 'true') {
      index += 1
    }
  }

  return args
}

function ensureDir(target: string) {
  fs.mkdirSync(target, { recursive: true })
}

function toScalar(value: unknown) {
  if (value == null) {
    return 'null'
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (typeof value === 'string') {
    if (value.includes('\n')) {
      return `|\n${value
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')}`
    }

    if (/^[A-Za-z0-9._/@:-]+$/.test(value)) {
      return value
    }

    return JSON.stringify(value)
  }

  return JSON.stringify(value)
}

function renderYaml(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent)

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${pad}[]`
    }

    return value
      .map((entry) => {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          const rendered = renderYaml(entry, indent + 2)
          const [first, ...rest] = rendered.split('\n')
          return `${pad}- ${first.trimStart()}${rest.length ? `\n${rest.join('\n')}` : ''}`
        }

        const scalar = toScalar(entry)
        if (scalar.startsWith('|\n')) {
          return `${pad}- ${scalar.replace('|\n', '|\n' + ' '.repeat(indent + 2))}`
        }
        return `${pad}- ${scalar}`
      })
      .join('\n')
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      return `${pad}{}`
    }

    return entries
      .map(([key, entry]) => {
        if (entry && typeof entry === 'object') {
          if (Array.isArray(entry) && entry.length === 0) {
            return `${pad}${key}: []`
          }

          if (!Array.isArray(entry) && Object.keys(entry as Record<string, unknown>).length === 0) {
            return `${pad}${key}: {}`
          }

          return `${pad}${key}:\n${renderYaml(entry, indent + 2)}`
        }

        const scalar = toScalar(entry)
        if (scalar.startsWith('|\n')) {
          const body = scalar
            .slice(2)
            .split('\n')
            .map((line) => `${' '.repeat(indent + 2)}${line}`)
            .join('\n')
          return `${pad}${key}: |\n${body.trimEnd()}`
        }
        return `${pad}${key}: ${scalar}`
      })
      .join('\n')
  }

  return `${pad}${toScalar(value)}`
}

function buildSampleDeployment(plan: ReturnType<typeof buildKubernetesEnforcementPlan>) {
  const replicaFactor = plan.scaling.targetReplicaFactor <= 0 ? 0 : Math.max(1, Math.ceil(plan.scaling.targetReplicaFactor))

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'co2-router-governed-workload',
      labels: {
        app: 'co2-router-governed-workload',
        ...plan.labels,
      },
      annotations: plan.annotations,
    },
    spec: {
      replicas: replicaFactor,
      selector: {
        matchLabels: {
          app: 'co2-router-governed-workload',
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'co2-router-governed-workload',
            ...plan.labels,
          },
          annotations: plan.annotations,
        },
        spec: {
          nodeSelector: plan.nodeSelector,
          tolerations: plan.tolerations,
          affinity: {
            nodeAffinity: {
              requiredDuringSchedulingIgnoredDuringExecution: {
                nodeSelectorTerms: [
                  {
                    matchExpressions: [
                      {
                        key: 'topology.kubernetes.io/region',
                        operator: 'In',
                        values: [plan.nodeAffinity.requiredRegion],
                      },
                    ],
                  },
                ],
              },
            },
          },
          containers: [
            {
              name: 'workload',
              image: 'ghcr.io/co2router/governed-workload:latest',
              imagePullPolicy: 'IfNotPresent',
              env: [
                {
                  name: 'ECOBE_DECISION_FRAME_ID',
                  value: plan.labels['ecobe.io/decision-frame'],
                },
                {
                  name: 'ECOBE_APPROVED_REGION',
                  value: plan.labels['ecobe.io/region'],
                },
              ],
              resources: {
                requests: {
                  cpu: '250m',
                  memory: '256Mi',
                },
                limits: {
                  cpu: '500m',
                  memory: '512Mi',
                },
              },
            },
          ],
        },
      },
    },
  }
}

function buildReadme(config: {
  decisionFrameId: string
  decision: Decision
  selectedRegion: string
  policyProfile: PolicyProfile
  criticality: Criticality
}) {
  return `# CO2 Router Kubernetes Enforcement Bundle

This bundle was generated from the same deterministic policy engine used for live CO2 Router authorization.

- Decision frame: \`${config.decisionFrameId}\`
- Binding action: \`${config.decision}\`
- Approved region: \`${config.selectedRegion}\`
- Policy profile: \`${config.policyProfile}\`
- Criticality: \`${config.criticality}\`

Files:

- \`bundle.json\`: raw machine-readable enforcement payload
- \`gatekeeper-template.yaml\`: ConstraintTemplate derived from the decision frame
- \`gatekeeper-constraint.yaml\`: matching Gatekeeper constraint
- \`sample-workload.yaml\`: example governed workload manifest carrying the required labels and annotations

Apply with:

\`\`\`bash
kubectl apply -f gatekeeper-template.yaml
kubectl apply -f gatekeeper-constraint.yaml
kubectl apply -f sample-workload.yaml
\`\`\`
`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const decisionFrameId = args.get('decision-frame-id') || `df-${Date.now()}`
  const decision = (args.get('decision') || 'run_now') as Decision
  const selectedRegion = args.get('selected-region') || 'us-east-1'
  const policyProfile = (args.get('policy-profile') || 'default') as PolicyProfile
  const criticality = (args.get('criticality') || 'standard') as Criticality
  const outputDir = path.resolve(args.get('output-dir') || path.join(process.cwd(), 'k8s', 'enforcement-bundles', decision))
  const proofHash = args.get('proof-hash') || `sha256:${decisionFrameId}`
  const generatedAt = args.get('generated-at') ? new Date(args.get('generated-at') as string) : new Date()
  const notBefore = args.get('not-before') || null
  const delayMinutes = args.get('delay-minutes') ? Number(args.get('delay-minutes')) : undefined
  const throttleFactor = args.get('throttle-factor') ? Number(args.get('throttle-factor')) : undefined

  const plan = buildKubernetesEnforcementPlan({
    decisionFrameId,
    decision,
    decisionMode: 'runtime_authorization',
    reasonCode: `EXPORT_${decision.toUpperCase()}`,
    selectedRegion,
    policyProfile,
    criticality,
    generatedAt,
    notBefore,
    delayMinutes,
    throttleFactor,
    proofHash,
  })

  const sampleDeployment = buildSampleDeployment(plan)

  ensureDir(outputDir)
  fs.writeFileSync(path.join(outputDir, 'bundle.json'), JSON.stringify(plan, null, 2))
  fs.writeFileSync(path.join(outputDir, 'gatekeeper-template.yaml'), `${renderYaml(plan.gatekeeper.template)}\n`)
  fs.writeFileSync(path.join(outputDir, 'gatekeeper-constraint.yaml'), `${renderYaml(plan.gatekeeper.constraint)}\n`)
  fs.writeFileSync(path.join(outputDir, 'sample-workload.yaml'), `${renderYaml(sampleDeployment)}\n`)
  fs.writeFileSync(
    path.join(outputDir, 'README.md'),
    buildReadme({
      decisionFrameId,
      decision,
      selectedRegion,
      policyProfile,
      criticality,
    })
  )

  process.stdout.write(`Exported Kubernetes enforcement bundle to ${outputDir}\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
