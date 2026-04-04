CREATE TYPE "DesignPartnerType" AS ENUM ('design');

CREATE TYPE "DesignPartnerStatus" AS ENUM (
    'applied',
    'qualified',
    'accepted',
    'onboarding',
    'active',
    'graduating',
    'converted',
    'declined',
    'churned'
);

CREATE TYPE "DesignPartnerOnboardingStage" AS ENUM (
    'fit_confirmed',
    'agreement_sent',
    'agreement_signed',
    'kickoff_scheduled',
    'technical_setup',
    'first_value',
    'active_pilot',
    'graduation_review',
    'converted_paid'
);

CREATE TABLE "design_partners" (
    "id" TEXT NOT NULL,
    "crm_key" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_domain" TEXT,
    "team_name" TEXT,
    "team_type" TEXT,
    "applicant_name" TEXT NOT NULL,
    "applicant_email" TEXT NOT NULL,
    "role_title" TEXT NOT NULL,
    "main_workloads_platforms" TEXT NOT NULL,
    "goals_summary" TEXT NOT NULL,
    "scoped_workflow" TEXT NOT NULL,
    "internal_champion" TEXT NOT NULL,
    "commercial_approver" TEXT,
    "commitment_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "anonymized_proof_permission" BOOLEAN NOT NULL DEFAULT false,
    "partner_type" "DesignPartnerType" NOT NULL DEFAULT 'design',
    "cohort" TEXT NOT NULL DEFAULT 'v1',
    "status" "DesignPartnerStatus" NOT NULL DEFAULT 'applied',
    "onboarding_stage" "DesignPartnerOnboardingStage",
    "first_value_at" TIMESTAMP(3),
    "converted_to_paid_at" TIMESTAMP(3),
    "total_partner_sourced_arr" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_partners_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "design_partners_crm_key_key" ON "design_partners"("crm_key");
CREATE INDEX "design_partners_partner_type_cohort_idx" ON "design_partners"("partner_type", "cohort");
CREATE INDEX "design_partners_status_created_at_idx" ON "design_partners"("status", "created_at");
CREATE INDEX "design_partners_onboarding_stage_updated_at_idx" ON "design_partners"("onboarding_stage", "updated_at");
CREATE INDEX "design_partners_company_domain_idx" ON "design_partners"("company_domain");
CREATE INDEX "design_partners_applicant_email_idx" ON "design_partners"("applicant_email");
