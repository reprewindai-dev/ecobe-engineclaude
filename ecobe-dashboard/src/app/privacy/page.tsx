import { LegalPageShell } from '@/components/legal/LegalPageShell'

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Privacy policy"
      title="Privacy for a proof-backed control plane."
      summary="CO2 Router stores the minimum operational data needed to route workloads, generate proof, support replay, and maintain service integrity. This page describes the practical handling of request metadata, decision evidence, and support information."
      sections={[
        {
          heading: 'What we collect',
          body: [
            'We collect account information, integration metadata, workload routing inputs, proof artifacts, decision outcomes, and operational telemetry required to run the service. This can include organization identifiers, candidate regions, workload class, timing constraints, routing outcomes, and decision timestamps.',
            'We also process support and contact submissions so we can respond to customer requests, provision environments, and manage billing or incident follow-up.',
          ],
        },
        {
          heading: 'How data is used',
          body: [
            'Data is used to operate the control plane, enforce routing decisions, generate replayable proof, monitor latency and degraded states, and provide customer support. We also use service telemetry to improve resilience, detect failures, and maintain secure operation.',
            'We do not treat proof records as marketing artifacts. They are operational evidence and are retained because they are part of the product contract.',
          ],
        },
        {
          heading: 'Retention and disclosure',
          body: [
            'Operational records are retained for as long as needed to provide service continuity, replay, audit support, dispute resolution, and legal compliance. Retention windows may vary by customer plan or explicit agreement.',
            'We disclose information only to service providers or legal authorities when required to run the platform, comply with law, protect rights, or respond to verified incidents. We do not sell customer operational data.',
          ],
        },
      ]}
    />
  )
}
