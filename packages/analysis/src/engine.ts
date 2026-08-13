import { canonicalHash } from "./canonical.js";
import {
  ANALYSIS_SCHEMA_VERSION,
  CLASSIFICATION_POLICY_VERSION,
  type AnalysisMeasurement,
  type AnalysisSummary,
  type AnalysisWindowDefinition,
  type CellMetrics,
  type EvidenceStrength,
  type PeerBaseline,
  type RouteClassification,
  type TransactionClass,
  type WilsonInterval,
} from "./types.js";

const MINIMUM_COMPLETE = 30;
const STRONG_COMPLETE = 60;
const MAX_INCONCLUSIVE_RATE = 0.10;
const CLASSES: readonly TransactionClass[] = ["MATCHED_CONTROL", "PROGRAM_X"];

export function analyzeWindow(definition: AnalysisWindowDefinition, measurements: readonly AnalysisMeasurement[]): AnalysisSummary {
  validateDefinition(definition);
  const scoped = measurements.filter(value => belongsToWindow(definition, value));
  const duplicateSignatures = duplicated(scoped.map(value => value.signature));
  if (duplicateSignatures.length > 0) throw new Error(`signature reuse across statistical units: ${duplicateSignatures.join(",")}`);
  const duplicateUnitIds = duplicated(scoped.map(value => value.unitId));
  if (duplicateUnitIds.length > 0) throw new Error(`duplicate statistical units: ${duplicateUnitIds.join(",")}`);

  const invalidUnitIds = scoped.filter(value => !value.matchingValid).map(value => value.unitId).sort();
  const cells = definition.routeIds.flatMap(routeId => CLASSES.map(transactionClass =>
    aggregateCell(definition, scoped, routeId, transactionClass)));
  const classifications = definition.routeIds.map(routeId => classifyRoute(routeId, cells, definition.routeIds));
  const normalizedInput = {
    definition,
    measurements: [...scoped].sort(compareMeasurement),
  };
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    policyVersion: CLASSIFICATION_POLICY_VERSION,
    inputHash: canonicalHash(normalizedInput),
    definition,
    cells,
    classifications,
    invalidUnitIds,
    duplicateSignatures,
  };
}

function aggregateCell(
  definition: AnalysisWindowDefinition,
  measurements: readonly AnalysisMeasurement[],
  routeId: string,
  transactionClass: TransactionClass,
): CellMetrics {
  const candidates = measurements.filter(value => value.routeId === routeId && value.transactionClass === transactionClass);
  const valid = candidates.filter(value => value.matchingValid && definition.probeIndices.includes(value.probeIndex));
  const successCount = valid.filter(isSuccess).length;
  const inconclusiveCount = valid.filter(value => value.outcome === "OBSERVATION_INCONCLUSIVE").length;
  const completeCaseCount = valid.length - inconclusiveCount;
  const completeCaseSuccessCount = valid.filter(value => value.outcome !== "OBSERVATION_INCONCLUSIVE" && isSuccess(value)).length;
  return {
    routeId,
    transactionClass,
    expectedCount: definition.probeIndices.length,
    completeCount: valid.length,
    missingCount: Math.max(0, definition.probeIndices.length - valid.length),
    invalidExclusionCount: candidates.length - valid.length,
    successCount,
    inconclusiveCount,
    pairingBreachCount: valid.filter(value => value.pairingWindowBreached).length,
    successRate: rate(successCount, valid.length),
    completeCaseSuccessRate: completeCaseCount === 0 ? null : rate(completeCaseSuccessCount, completeCaseCount),
    inconclusiveRate: rate(inconclusiveCount, valid.length),
    wilson95: wilson95(successCount, valid.length),
  };
}

function classifyRoute(routeId: string, cells: readonly CellMetrics[], allRouteIds: readonly string[]): RouteClassification {
  const control = cell(cells, routeId, "MATCHED_CONTROL");
  const test = cell(cells, routeId, "PROGRAM_X");
  const peerTestBaseline = peerBaseline(routeId, cells, allRouteIds);
  const gap = round(Math.abs(control.successRate - test.successRate));
  let classification: RouteClassification["classification"];
  let reasons: string[];

  if (control.completeCount < MINIMUM_COMPLETE || test.completeCount < MINIMUM_COMPLETE) {
    classification = "INSUFFICIENT_DATA";
    reasons = [`minimum ${MINIMUM_COMPLETE} complete units required per route/class`];
  } else if (control.inconclusiveRate > MAX_INCONCLUSIVE_RATE || test.inconclusiveRate > MAX_INCONCLUSIVE_RATE) {
    classification = "UNKNOWN";
    reasons = ["inconclusive rate exceeds 0.10 data-quality guard"];
  } else if (control.successRate <= 0.40 && test.successRate <= 0.40 && gap <= 0.20) {
    classification = "DEGRADED";
    reasons = ["both matched classes are broadly degraded"];
  } else if (control.successRate >= 0.90 && test.successRate <= 0.20 &&
      peerTestBaseline.successRate !== null && peerTestBaseline.successRate >= 0.90 &&
      control.successRate - test.successRate >= 0.60 && peerTestBaseline.successRate - test.successRate >= 0.60) {
    classification = "ASYMMETRIC";
    reasons = ["healthy control and leave-one-route-out peers contrast with degraded PROGRAM_X"];
  } else if (control.successRate >= 0.90 && test.successRate >= 0.90 && gap <= 0.10) {
    classification = "HEALTHY";
    reasons = ["both matched classes satisfy healthy thresholds"];
  } else {
    classification = "UNKNOWN";
    reasons = ["measurements do not satisfy a ClassificationPolicyV0Experimental outcome"];
  }

  return {
    routeId,
    classification,
    evidenceStrength: evidenceStrength(classification, control, test, peerTestBaseline),
    reasons,
    controlSuccessRate: control.successRate,
    testSuccessRate: test.successRate,
    absoluteClassGap: gap,
    peerTestBaseline,
  };
}

function peerBaseline(routeId: string, cells: readonly CellMetrics[], allRouteIds: readonly string[]): PeerBaseline {
  const routes = allRouteIds.filter(value => value !== routeId).map(peerRouteId => cell(cells, peerRouteId, "PROGRAM_X"));
  const eligible = routes.filter(value => value.completeCount >= MINIMUM_COMPLETE && value.inconclusiveRate <= MAX_INCONCLUSIVE_RATE);
  const completeCount = eligible.reduce((total, value) => total + value.completeCount, 0);
  const successCount = eligible.reduce((total, value) => total + value.successCount, 0);
  return {
    excludedRouteId: routeId,
    eligibleRouteIds: eligible.map(value => value.routeId),
    completeCount,
    successCount,
    successRate: completeCount === 0 ? null : rate(successCount, completeCount),
    routes: routes.map(value => ({
      routeId: value.routeId,
      completeCount: value.completeCount,
      successRate: value.successRate,
      inconclusiveRate: value.inconclusiveRate,
    })),
  };
}

function evidenceStrength(
  classification: RouteClassification["classification"],
  control: CellMetrics,
  test: CellMetrics,
  peers: PeerBaseline,
): EvidenceStrength {
  if (classification === "INSUFFICIENT_DATA") return "INSUFFICIENT";
  if (classification === "UNKNOWN") return "NONE";
  const requiredCounts = classification === "ASYMMETRIC"
    ? [control.completeCount, test.completeCount, ...peers.routes.filter(value => peers.eligibleRouteIds.includes(value.routeId)).map(value => value.completeCount)]
    : [control.completeCount, test.completeCount];
  return requiredCounts.every(count => count >= STRONG_COMPLETE) ? "STRONG_CONTROLLED" : "LIMITED";
}

function wilson95(successes: number, total: number): WilsonInterval {
  if (total === 0) return { low: 0, high: 0 };
  const z = 1.959963984540054;
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = (proportion + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((proportion * (1 - proportion) / total) + (z * z) / (4 * total * total));
  return { low: round(Math.max(0, centre - margin)), high: round(Math.min(1, centre + margin)) };
}

function belongsToWindow(definition: AnalysisWindowDefinition, value: AnalysisMeasurement): boolean {
  return value.experimentId === definition.experimentId && value.experimentVersion === definition.experimentVersion &&
    value.configurationHash === definition.configurationHash && value.phase === definition.phase &&
    value.observerId === definition.observerId && definition.routeIds.includes(value.routeId);
}

function isSuccess(value: AnalysisMeasurement): boolean {
  return value.outcome === "CONFIRMED_EXECUTION_SUCCESS" || value.outcome === "FINALIZED_EXECUTION_SUCCESS";
}

function validateDefinition(definition: AnalysisWindowDefinition): void {
  if (definition.routeIds.length < 2 || new Set(definition.routeIds).size !== definition.routeIds.length) throw new Error("at least two unique routes are required");
  if (definition.probeIndices.length === 0 || new Set(definition.probeIndices).size !== definition.probeIndices.length) throw new Error("probe indices must be non-empty and unique");
}

function cell(cells: readonly CellMetrics[], routeId: string, transactionClass: TransactionClass): CellMetrics {
  const value = cells.find(candidate => candidate.routeId === routeId && candidate.transactionClass === transactionClass);
  if (value === undefined) throw new Error(`missing cell ${routeId}/${transactionClass}`);
  return value;
}

function duplicated(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) seen.has(value) ? duplicates.add(value) : seen.add(value);
  return [...duplicates].sort();
}

function compareMeasurement(left: AnalysisMeasurement, right: AnalysisMeasurement): number {
  return left.routeId.localeCompare(right.routeId) || left.transactionClass.localeCompare(right.transactionClass) || left.probeIndex - right.probeIndex;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

