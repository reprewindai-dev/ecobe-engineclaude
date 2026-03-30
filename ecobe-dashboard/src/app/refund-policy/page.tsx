import { LegalPageShell } from '@/components/legal/LegalPageShell'

export default function RefundPolicyPage() {
  return (
    <LegalPageShell
      eyebrow="Refund policy"
      title="Refunds, credits, and billing adjustments."
      summary="CO2 Router is sold as an operating system for compute control, not as a passive content product. Refund handling is therefore tied to billing period, delivery status, and service failure, not to preference after use."
      sections={[
        {
          heading: 'Monthly plans',
          body: [
            'Monthly subscriptions renew automatically unless canceled before the next billing cycle. Fees already paid for a completed billing period are generally non-refundable once service access or usage has begun.',
            'If a plan was charged in error or the service was materially unavailable for reasons attributable to us, we may issue a prorated credit or refund at our discretion.',
          ],
        },
        {
          heading: 'Enterprise agreements',
          body: [
            'Enterprise billing, implementation work, and custom support arrangements follow the commercial terms in the customer agreement. Those terms control if they conflict with this public policy.',
            'Non-recurring services, setup fees, and custom implementation work are non-refundable once delivered or materially underway unless otherwise agreed in writing.',
          ],
        },
        {
          heading: 'How to request help',
          body: [
            'Refund or credit requests should be sent through the contact channel listed on this site with the billing email, organization name, invoice reference, and a concise description of the issue.',
            'We review requests in good faith and respond as quickly as practical. Service credits may be used when they are the cleaner operational remedy.',
          ],
        },
      ]}
    />
  )
}
