export const designPartnerContactEmail = 'founder@co2router.com'

export const designPartnerHeroStats = [
  { value: '3 to 5', label: 'active partners max' },
  { value: '90 days', label: 'pilot term' },
  { value: '1 workflow', label: 'scoped lane per partner' },
  { value: '1 paid', label: 'phase-one conversion target' },
] as const

export const designPartnerIdealProfiles = [
  'Infra, platform, SRE, or data teams with meaningful cloud, CI, or scheduled compute.',
  'Operators under pressure around emissions, workload placement, compliance, or policy enforcement.',
  'Teams with an internal champion and a commercial path if value is proven quickly.',
] as const

export const designPartnerDisqualifiers = [
  'Vague curiosity with no practical workflow to test in the next few weeks.',
  'Requests for open-ended consulting or a custom product branch for one company.',
  'Teams without a champion, without a path to commercial approval, or looking for indefinite free access.',
] as const

export const designPartnerUseCases = [
  {
    title: 'GitHub Actions and CI routing',
    detail:
      'Put CO2 Router in front of build and test execution to decide whether jobs run now, reroute to a cleaner region, or delay under policy.',
  },
  {
    title: 'Scheduled and batch compute',
    detail:
      'Govern recurring jobs, model refreshes, ETL pipelines, and non-urgent workloads with real environmental authorization before launch.',
  },
  {
    title: 'High-compute policy gates',
    detail:
      'Apply binding checks to expensive or high-impact jobs where carbon, water, placement, or traceability policy must be satisfied before execution.',
  },
] as const

export const designPartnerBenefits = [
  'Early access to CO2 Router in one real limited-scope workflow.',
  'Hands-on integration support and direct founder access.',
  'Influence over roadmap inside the scoped pilot lane.',
  'Preferred founding pricing if the pilot converts.',
] as const

export const designPartnerCommitments = [
  'A 3-month pilot term with one clearly scoped workflow or workload family.',
  'Biweekly feedback sessions plus async communication by email or portal.',
  'Practical integration cooperation and honest feedback on value, friction, and missing pieces.',
  'Permission for anonymized results if the pilot succeeds. Named reference only with explicit approval.',
] as const

export const designPartnerTimeline = [
  {
    phase: 'Month 0',
    title: 'Qualification and setup',
    detail:
      'Confirm ICP fit, lock scope, sign the design partner agreement, define success metrics, create the CRM record, and schedule kickoff.',
  },
  {
    phase: 'Month 1',
    title: 'Activation',
    detail:
      'Onboard technically, connect the first workflow, run the first real policy decision, and record first_value_at as soon as live value appears.',
  },
  {
    phase: 'Month 2',
    title: 'Iteration',
    detail:
      'Expand only within the agreed scope, refine policies and proof surfaces, and log operational feedback against live usage.',
  },
  {
    phase: 'Month 3',
    title: 'Graduation',
    detail:
      'Review outcomes before term end, present the paid continuation plan, and either convert, extend with a strict reason, or close cleanly.',
  },
] as const

export const designPartnerCommercialRules = [
  'No unlimited free access and no hidden pricing transition later.',
  'No vague "let\'s explore" pilots and no scope drift outside the single workflow lane.',
  'No more than 3 to 5 active partners at once.',
  'Every pilot starts with an explicit paid continuation path from day one.',
] as const

export const designPartnerSuccessMetrics = [
  'Accepted design partners',
  'Onboarding completion rate',
  'Time to first value',
  'Live workloads or policies governed',
  'Biweekly call completion rate',
  'Partner-sourced revenue and converted_to_paid_at',
  'Expansion to additional workflows',
  'Case study, quote, or anonymized proof asset created',
] as const

export const designPartnerPageCopy = {
  eyebrow: 'Design Partner Program V1',
  title: 'Help shape the pre-execution control plane for compute.',
  summary:
    'CO2 Router decides whether compute is allowed to run, where it should run, and under what environmental conditions before execution happens. This is a structured pilot for a small number of teams that want live value, direct access, and a clear commercial path if the system proves itself in one real workflow.',
  posterTitle: 'Pre-execution environmental authorization, not another sustainability dashboard.',
  posterDetail:
    'The pilot is built to secure real partners, real governed workloads, real proof, and paid conversion. The win condition is narrow and operational: three accepted partners, first value fast, one paid conversion, and one usable proof asset.',
} as const
