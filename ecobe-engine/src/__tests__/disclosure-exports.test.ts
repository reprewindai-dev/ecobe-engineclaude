import {
  buildDisclosureEnvelope,
  buildDisclosureCsv,
  resolveDisclosureScope,
  toDisclosureRecord,
} from '../lib/disclosure-exports'

describe('disclosure exports', () => {
  it('resolves organization scope when orgId is present', () => {
    expect(resolveDisclosureScope('org_123')).toEqual({
      scope: 'organization',
      orgId: 'org_123',
    })
  })

  it('rejects organization scope without orgId', () => {
    expect(() => resolveDisclosureScope(undefined, 'organization')).toThrow(
      'orgId is required when scope=organization'
    )
  })

  it('builds signed disclosure envelopes deterministically', () => {
    const record = toDisclosureRecord({
      id: 'ledger_1',
      orgId: 'org_123',
      decisionFrameId: 'frame_1',
      createdAt: new Date('2026-03-23T10:00:00.000Z'),
      chosenStartTs: new Date('2026-03-23T10:05:00.000Z'),
      jobClass: 'batch',
      workloadType: 'ci/heavy',
      baselineRegion: 'eastus',
      chosenRegion: 'norwayeast',
      baselineCarbonGPerKwh: 450,
      chosenCarbonGPerKwh: 60,
      energyEstimateKwh: 0.24,
      baselineCarbonG: 108,
      chosenCarbonG: 14.4,
      carbonSavedG: 93.6,
      accountingMethod: 'flow-traced',
      sourceUsed: 'EIA930_FUEL_MIX_IPCC',
      validationSource: 'ember',
      fallbackUsed: false,
      estimatedFlag: false,
      syntheticFlag: false,
      qualityTier: 'high',
      confidenceLabel: 'high',
      disagreementFlag: false,
      disagreementPct: 0,
      routingMode: 'assurance',
      policyMode: 'sec_disclosure_strict',
      signalTypeUsed: 'average_operational',
      referenceTime: new Date('2026-03-23T09:55:00.000Z'),
      dataFreshnessSeconds: 120,
      confidenceBandLow: 52,
      confidenceBandMid: 60,
      confidenceBandHigh: 67,
      lowerHalfBenchmarkGPerKwh: 120,
      lowerHalfQualified: true,
      metadata: {},
    })

    const envelope = buildDisclosureEnvelope({
      batchId: 'batch_1',
      generatedAt: '2026-03-23T11:00:00.000Z',
      scope: 'organization',
      orgId: 'org_123',
      records: [record],
      signingSecret: 'super-secret-signing-key',
    })

    expect(envelope.record_count).toBe(1)
    expect(envelope.integrity.payload_digest).toHaveLength(64)
    expect(envelope.integrity.signature).toHaveLength(64)
    expect(envelope.records[0].assurance_mode).toBe(true)
    expect(buildDisclosureCsv(envelope.records)).toContain('organization_id')
    expect(buildDisclosureCsv(envelope.records)).toContain('org_123')
  })
})
