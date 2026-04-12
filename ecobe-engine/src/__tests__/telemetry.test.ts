import {
  getTelemetrySnapshot,
  recordTelemetryMetric,
  resetTelemetryMetrics,
} from "../lib/observability/telemetry";

describe("telemetry metric store", () => {
  beforeEach(() => {
    resetTelemetryMetrics();
  });

  afterEach(() => {
    resetTelemetryMetrics();
  });

  it("caps per-metric samples while preserving the latest record", () => {
    for (let index = 1; index <= 550; index += 1) {
      recordTelemetryMetric("ecobe.test.metric", "histogram", index, {
        ordinal: index,
      });
    }

    const snapshot = getTelemetrySnapshot();
    const metric = snapshot.metrics.find(
      (entry) => entry.name === "ecobe.test.metric",
    );

    expect(metric).toBeDefined();
    expect(metric?.samples).toBe(500);
    expect(metric?.lastValue).toBe(550);
    expect(metric?.attributes).toEqual({ ordinal: 550 });
    expect(metric?.sum).toBeGreaterThan(0);
  });
});
