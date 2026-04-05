import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

function resolveTsxCli() {
  return path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
}

describe('k8s enforcement bundle exporter', () => {
  it('quotes string annotations that YAML would otherwise coerce', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecobe-k8s-export-'))
    const scriptPath = path.join(process.cwd(), 'scripts', 'export-k8s-enforcement-bundle.ts')

    execFileSync(
      process.execPath,
      [
        resolveTsxCli(),
        scriptPath,
        '--decision-frame-id',
        'df-gatekeeper-deny-proof',
        '--decision',
        'deny',
        '--selected-region',
        'us-east-1',
        '--proof-hash',
        'sha256:df-gatekeeper-deny-proof',
        '--generated-at',
        '2026-04-05T08:14:41.788Z',
        '--output-dir',
        outputDir,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'pipe',
      }
    )

    const sampleWorkload = fs.readFileSync(path.join(outputDir, 'sample-workload.yaml'), 'utf8')

    expect(sampleWorkload).toContain('ecobe.io/blocked: "true"')
    expect(sampleWorkload).toContain('ecobe.io/generated-at: "2026-04-05T08:14:41.788Z"')
  })
})
