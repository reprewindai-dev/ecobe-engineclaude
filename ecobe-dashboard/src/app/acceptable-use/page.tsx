import { LegalPageShell } from '@/components/legal/LegalPageShell'

export default function AcceptableUsePage() {
  return (
    <LegalPageShell
      eyebrow="Acceptable use"
      title="How CO2 Router may and may not be used."
      summary="The platform is designed for legitimate workload routing, sustainability governance, proof generation, and infrastructure operations. Misuse that undermines service integrity, customer safety, or downstream systems is not allowed."
      sections={[
        {
          heading: 'Permitted use',
          body: [
            'Customers may use CO2 Router to route compute, inspect proof, operate simulation surfaces, and integrate decisioning into CI, orchestration, or control workflows that they are authorized to manage.',
            'Testing, evaluation, and controlled demonstrations are allowed when they do not misrepresent system behavior or attempt to degrade shared infrastructure.',
          ],
        },
        {
          heading: 'Prohibited behavior',
          body: [
            'You may not abuse API limits, attempt to exfiltrate secrets, reverse engineer private infrastructure details, tamper with proof records, or use the service to interfere with other customers, providers, or public infrastructure.',
            'You may not use the product to create fraudulent evidence, hide policy violations, or falsely represent that a routed outcome was produced by the control plane when it was not.',
          ],
        },
        {
          heading: 'Enforcement',
          body: [
            'We may suspend or terminate access when we detect abuse, security threats, repeated payment failures, or clear violations of these rules. We may also pause integrations or rotate credentials when required to protect the platform.',
            'Security investigations and abuse responses may be logged and retained as part of the service integrity record.',
          ],
        },
      ]}
    />
  )
}
