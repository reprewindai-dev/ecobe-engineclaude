import { z } from "zod";

export const DEFAULT_DOCTRINE_SETTINGS = {
  weights: {
    carbon: 50,
    water: 33,
    latency: 8,
    cost: 9,
  },
  caps: {
    maxDelayMinutes: 240,
  },
  modes: {
    waterPolicyProfile: "default",
  },
  rules: {
    denyHighWaterStress: true,
    allowDelayUpTo4Hours: true,
    blockUsEast1: true,
    greenOpsGate: true,
    requireTwoApproverGovernance: true,
  },
} as const;

export const DoctrineSettingsSchema = z
  .object({
    weights: z.object({
      carbon: z.number().min(0).max(100),
      water: z.number().min(0).max(100),
      latency: z.number().min(0).max(100),
      cost: z.number().min(0).max(100),
    }),
    caps: z
      .object({
        maxDelayMinutes: z.number().int().min(0).max(240),
      })
      .default(DEFAULT_DOCTRINE_SETTINGS.caps),
    modes: z
      .object({
        waterPolicyProfile: z.enum([
          "default",
          "drought_sensitive",
          "eu_data_center_reporting",
          "high_water_sensitivity",
        ]),
      })
      .default(DEFAULT_DOCTRINE_SETTINGS.modes),
    rules: z.object({
      denyHighWaterStress: z.boolean(),
      allowDelayUpTo4Hours: z.boolean(),
      blockUsEast1: z.boolean(),
      greenOpsGate: z.boolean(),
      requireTwoApproverGovernance: z.boolean(),
    }),
  })
  .superRefine((value, ctx) => {
    const total =
      value.weights.carbon +
      value.weights.water +
      value.weights.latency +
      value.weights.cost;
    if (total <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weights"],
        message: "Doctrine weights must add up to a value greater than zero.",
      });
    }
  });

export const DoctrineProposalPayloadSchema = z.object({
  changeSummary: z.string().min(6).max(280),
  justification: z.string().min(12).max(2000),
  settings: DoctrineSettingsSchema,
  effectiveAt: z.string().datetime().optional(),
});

export const DoctrineRejectPayloadSchema = z.object({
  reason: z.string().min(6).max(1000),
});

export function normalizeDoctrineWeights(weights: {
  carbon: number;
  water: number;
  latency: number;
  cost: number;
}) {
  const values = {
    carbon: Math.round(weights.carbon),
    water: Math.round(weights.water),
    latency: Math.round(weights.latency),
    cost: Math.round(weights.cost),
  };
  const total =
    values.carbon + values.water + values.latency + values.cost;
  if (total <= 0) {
    return { ...DEFAULT_DOCTRINE_SETTINGS.weights };
  }

  const keys = ["carbon", "water", "latency", "cost"] as const;
  const scaled: Record<(typeof keys)[number], number> = {
    carbon: 0,
    water: 0,
    latency: 0,
    cost: 0,
  };

  let running = 0;
  for (const key of keys) {
    const next = Math.round((values[key] / total) * 100);
    scaled[key] = next;
    running += next;
  }

  if (running !== 100) {
    scaled.carbon += 100 - running;
  }

  return scaled;
}

export function normalizeDoctrineSettings(input: unknown) {
  const parsed = DoctrineSettingsSchema.parse(input);
  return {
    ...parsed,
    weights: normalizeDoctrineWeights(parsed.weights),
    caps: {
      maxDelayMinutes: parsed.caps.maxDelayMinutes,
    },
  };
}

export function doctrineVersionLabel(versionNumber: number) {
  return `doctrine_v${versionNumber}`;
}

export type DoctrineSettings = z.infer<typeof DoctrineSettingsSchema>;
export type DoctrineProposalPayload = z.infer<
  typeof DoctrineProposalPayloadSchema
>;
