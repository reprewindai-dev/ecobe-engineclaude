import {
  buildDecisionContextHash,
  derivePglRiskClass,
  mapDecisionToPglOutcome,
  mapRouterDecisionToPglDecision,
  preparePglDecisionLifecycle,
  resolvePglGovernanceContext,
  validatePglGovernanceContext,
} from "../lib/pgl/service";

describe("pgl service helpers", () => {
  it("maps router decisions into the locked PGL decision domain", () => {
    expect(mapRouterDecisionToPglDecision("noop")).toBe("noop");
    expect(mapRouterDecisionToPglDecision("run_now")).toBe("allow");
    expect(mapRouterDecisionToPglDecision("reroute")).toBe("allow");
    expect(mapRouterDecisionToPglDecision("delay")).toBe("allow");
    expect(mapRouterDecisionToPglDecision("throttle")).toBe("throttle");
    expect(mapRouterDecisionToPglDecision("deny")).toBe("deny");
  });

  it("enforces the fixed decision-to-outcome invariant", () => {
    expect(mapDecisionToPglOutcome("allow", "router_decision")).toBe(
      "permitted",
    );
    expect(mapDecisionToPglOutcome("deny", "router_decision")).toBe("denied");
    expect(mapDecisionToPglOutcome("throttle", "router_decision")).toBe(
      "throttled",
    );
    expect(mapDecisionToPglOutcome("noop", "session_start")).toBe("permitted");
    expect(mapDecisionToPglOutcome("allow", "error")).toBe("failed");
  });

  it("derives risk class outside the PGL layer", () => {
    expect(derivePglRiskClass("runtime_authorization")).toBe("high");
    expect(derivePglRiskClass("scenario_planning")).toBe("low");
  });

  it("builds a stable decision context hash from the minimal basis", () => {
    const governance = resolvePglGovernanceContext({
      correlationId: "corr-1",
      decisionMode: "runtime_authorization",
      policyVersion: "water-policy-v1",
      waterPolicyProfile: "default",
      criticality: "standard",
      preferredRegions: ["eu-west-1", "us-east-1"],
      selectedRegion: "eu-west-1",
      workloadType: "credit_decision",
      signalSnapshotRef: "sig:abc123",
    });

    expect(
      buildDecisionContextHash({
        governance,
        correlationId: "corr-1",
      }),
    ).toBe(
      buildDecisionContextHash({
        governance: { ...governance },
        correlationId: "corr-1",
      }),
    );
  });

  it("validates governance context against the active policy snapshot", () => {
    const governance = resolvePglGovernanceContext({
      correlationId: "corr-2",
      decisionMode: "runtime_authorization",
      policyVersion: "locked-v0",
      waterPolicyProfile: "default",
      criticality: "critical",
      preferredRegions: ["us-east-1"],
      workloadType: "runtime_authorization",
    });

    expect(
      validatePglGovernanceContext({
        policyVersion: "locked-v0",
        expectedPolicyVersion: "locked-v0",
        governance,
      }),
    ).toEqual({
      ok: true,
      reasonCode: "POLICY_RULE_MATCH",
      reasonDetail: "Governance policy snapshot accepted for CI authorization",
    });
  });

  it("prepares privacy-safe lifecycle hashes without storing raw payloads", () => {
    const governance = resolvePglGovernanceContext({
      correlationId: "corr-3",
      decisionMode: "scenario_planning",
      policyVersion: "locked-v0",
      waterPolicyProfile: "default",
      criticality: "batch",
      preferredRegions: ["us-east-1"],
      workloadType: "scenario_planning",
      signalSnapshotRef: "sig:xyz789",
    });
    const validation = validatePglGovernanceContext({
      policyVersion: "locked-v0",
      expectedPolicyVersion: "locked-v0",
      governance,
    });

    const prepared = preparePglDecisionLifecycle({
      correlationId: "corr-3",
      decisionFrameId: "frame-3",
      riskClass: "low",
      governance,
      validation,
      routerDecision: "run_now",
      decisionReasonCode: "POLICY_RULE_MATCH",
      decisionReasonDetail: "Rule X matched",
      requestHashInput: {
        requestId: "corr-3",
        preferredRegions: ["us-east-1"],
      },
      responseHashInput: {
        decision: "run_now",
        selectedRegion: "us-east-1",
      },
      requestMetadata: {
        transport: "sync_http",
      },
    });

    expect(prepared.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared.outputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared.sessionOutputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared.validationOutputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared.requestMetadata).toEqual({
      transport: "sync_http",
    });
  });
});
