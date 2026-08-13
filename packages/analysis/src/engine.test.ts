import { describe, expect, test } from "vitest";

import { analyzeWindow } from "./engine.js";
import { renderSummary } from "./report.js";
import type { AnalysisMeasurement, AnalysisWindowDefinition, MeasurementOutcome } from "./types.js";

const routes = ["route-a", "route-b", "route-c"] as const;

describe("ClassificationPolicyV0Experimental", () => {
  test.each([
    ["healthy", 30, ["HEALTHY", "HEALTHY", "HEALTHY"]],
    ["degraded", 30, ["DEGRADED", "HEALTHY", "HEALTHY"]],
    ["asymmetric", 30, ["ASYMMETRIC", "HEALTHY", "HEALTHY"]],
    ["insufficient_data", 10, ["INSUFFICIENT_DATA", "INSUFFICIENT_DATA", "INSUFFICIENT_DATA"]],
  ] as const)("derives reproducible %s results exclusively from measurements", (phase, count, expected) => {
    const definition = windowDefinition(phase, count);
    const measurements = scenarioMeasurements(definition);
    const first = analyzeWindow(definition, measurements);
    const second = analyzeWindow(definition, [...measurements].reverse());

    expect(first.classifications.map(value => value.classification)).toEqual(expected);
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.classifications).toEqual(second.classifications);
    expect(first.classifications[0]!.peerTestBaseline.routes.map(value => value.routeId)).toEqual(["route-b", "route-c"]);
  });

  test("general degradation cannot be classified as asymmetric", () => {
    const definition = windowDefinition("degraded", 30);
    const result = analyzeWindow(definition, scenarioMeasurements(definition));
    expect(result.classifications[0]!.classification).toBe("DEGRADED");
    expect(result.classifications.some(value => value.classification === "ASYMMETRIC")).toBe(false);
  });

  test("inconclusive data-quality failure takes precedence over apparent degradation", () => {
    const definition = windowDefinition("inconclusive", 30);
    const measurements = scenarioMeasurements(definition).map(value => value.routeId === "route-a" && value.probeIndex < 4
      ? { ...value, outcome: "OBSERVATION_INCONCLUSIVE" as const }
      : value);
    const result = analyzeWindow(definition, measurements);
    expect(result.classifications[0]!.classification).toBe("UNKNOWN");
    expect(result.classifications[0]!.evidenceStrength).toBe("NONE");
    expect(result.cells[0]!.completeCaseSuccessRate).toBe(1);
  });

  test("refuses signature reuse across statistical units", () => {
    const definition = windowDefinition("healthy", 30);
    const measurements = scenarioMeasurements(definition);
    const duplicate = { ...measurements[1]!, signature: measurements[0]!.signature };
    expect(() => analyzeWindow(definition, [measurements[0]!, duplicate, ...measurements.slice(2)]))
      .toThrow(/signature reuse/u);
  });

  test("renders byte-identical normalized Markdown, JSON, and CSV", () => {
    const definition = windowDefinition("asymmetric", 30);
    const measurements = scenarioMeasurements(definition);
    const first = renderSummary(analyzeWindow(definition, measurements));
    const second = renderSummary(analyzeWindow(definition, [...measurements].reverse()));
    expect(first).toEqual(second);
    expect(first.markdown).toContain("ASYMMETRIC");
    expect(first.json.endsWith("\n")).toBe(true);
    expect(first.csv.split("\n")).toHaveLength(5);
  });
});

function windowDefinition(phase: string, count: number): AnalysisWindowDefinition {
  return {
    experimentId: "sprint-5-controlled-fixture",
    experimentVersion: "1",
    configurationHash: "configuration-hash-v1",
    windowId: `window-${phase}`,
    windowVersion: "1",
    phase,
    observerId: "observer-local",
    routeIds: routes,
    probeIndices: Array.from({ length: count }, (_, index) => index),
  };
}

function scenarioMeasurements(definition: AnalysisWindowDefinition): AnalysisMeasurement[] {
  return definition.routeIds.flatMap(routeId => (["MATCHED_CONTROL", "PROGRAM_X"] as const).flatMap(transactionClass =>
    definition.probeIndices.map(probeIndex => {
      let outcome: MeasurementOutcome = "CONFIRMED_EXECUTION_SUCCESS";
      if (definition.phase === "degraded" && routeId === "route-a" && probeIndex < 24) outcome = "RPC_REJECTED_EXPIRED";
      if (definition.phase === "asymmetric" && routeId === "route-a" && transactionClass === "PROGRAM_X") outcome = "RPC_REJECTED_EXPIRED";
      return {
        experimentId: definition.experimentId,
        experimentVersion: definition.experimentVersion,
        configurationHash: definition.configurationHash,
        phase: definition.phase,
        observerId: definition.observerId,
        routeId,
        transactionClass,
        probeIndex,
        unitId: `${definition.phase}:${routeId}:${transactionClass}:${probeIndex}`,
        signature: `signature:${definition.phase}:${routeId}:${transactionClass}:${probeIndex}`,
        outcome,
        matchingValid: true,
        pairingWindowBreached: false,
      };
    })));
}

