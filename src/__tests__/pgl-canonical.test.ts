import {
  buildUuidV7,
  canonicalizeJson,
  hashCanonicalJson,
  normalizeIsoTimestamp,
} from "../lib/pgl/canonical";

describe("pgl canonicalization", () => {
  it("sorts object keys and normalizes undefined to null", () => {
    expect(
      canonicalizeJson({
        b: 2,
        a: undefined,
        c: {
          z: true,
          y: undefined,
        },
      }),
    ).toBe('{"a":null,"b":2,"c":{"y":null,"z":true}}');
  });

  it("produces deterministic hashes for identical payloads", () => {
    const payload = {
      governance_profile_id: "gprof_123",
      policy_snapshot_ref: "policy:1",
      signal_snapshot_ref: "signal:1",
      purpose: "runtime_authorization",
      operation: "ci_authorize",
      correlation_id: "corr-1",
    };

    expect(hashCanonicalJson(payload)).toBe(hashCanonicalJson({ ...payload }));
  });

  it("normalizes timestamps to ISO-8601 UTC with millisecond precision", () => {
    expect(normalizeIsoTimestamp("2026-04-11T16:40:12.123Z")).toBe(
      "2026-04-11T16:40:12.123Z",
    );
  });

  it("creates uuidv7-shaped identifiers", () => {
    expect(buildUuidV7("2026-04-11T16:40:12.123Z")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
