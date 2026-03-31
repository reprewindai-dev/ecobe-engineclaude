import { LegalPageShell } from '@/components/legal/LegalPageShell'

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Terms of service"
      title="Terms for operating CO2 Router."
      summary="These terms define how organizations use the CO2 Router control plane, proof surfaces, and related API paths. They are written to match the product posture: deterministic enforcement, shared infrastructure responsibility, and explicit operational boundaries."
      sections={[
        {
          heading: 'Service scope',
          body: [
            'CO2 Router provides routing, proof, replay, and signal-visibility surfaces for compute control. The service is designed for pre-execution decisioning and does not guarantee specific carbon, water, latency, or cost outcomes outside the data and policy envelope in force at decision time.',
            'Customers are responsible for configuring their workloads, deadlines, candidate regions, and policy tolerances accurately. The control plane can only make defensible decisions from the facts provided to it and the signal sources available at the time of execution.',
          ],
        },
        {
          heading: 'Customer obligations',
          body: [
            'Customers must protect credentials, use supported integration paths, and avoid bypassing enforcement behavior after a decision has been issued. Deliberate attempts to suppress proof, tamper with replay state, or misrepresent workload metadata are prohibited.',
            'Customers remain responsible for compliance with their own legal, regulatory, and contractual obligations. CO2 Router supplies decision evidence and enforcement logic, but it does not replace legal review or governance approvals inside a customer organization.',
          ],
        },
        {
          heading: 'Availability and change control',
          body: [
            'The service may evolve as signal providers, infrastructure, or policies change. Material changes to billing, plan limits, or product behavior are communicated through normal account channels.',
            'Operational degradations may cause the system to enter mirrored or fallback modes. When that happens, the service must continue to make the degraded state explicit in proof, replay, and control-surface posture.',
          ],
        },
      ]}
    />
  )
}
