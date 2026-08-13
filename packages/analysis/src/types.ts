export const ANALYSIS_SCHEMA_VERSION = "AsymmetryAnalysis@0.1.0" as const;
export const CLASSIFICATION_POLICY_VERSION = "ClassificationPolicyV0Experimental" as const;

export type TransactionClass = "MATCHED_CONTROL" | "PROGRAM_X";
export type Classification = "HEALTHY" | "DEGRADED" | "ASYMMETRIC" | "INSUFFICIENT_DATA" | "UNKNOWN";
export type EvidenceStrength = "INSUFFICIENT" | "LIMITED" | "STRONG_CONTROLLED" | "NONE";
export type MeasurementOutcome =
  | "CONFIRMED_EXECUTION_SUCCESS"
  | "FINALIZED_EXECUTION_SUCCESS"
  | "RPC_REJECTED_EXPIRED"
  | "OBSERVED_EXECUTION_FAILED"
  | "EXPIRED"
  | "OBSERVATION_INCONCLUSIVE";

export interface AnalysisWindowDefinition {
  readonly experimentId: string;
  readonly experimentVersion: string;
  readonly configurationHash: string;
  readonly windowId: string;
  readonly windowVersion: string;
  readonly phase: string;
  readonly observerId: string;
  readonly routeIds: readonly string[];
  readonly probeIndices: readonly number[];
}

export interface AnalysisMeasurement {
  readonly experimentId: string;
  readonly experimentVersion: string;
  readonly configurationHash: string;
  readonly phase: string;
  readonly observerId: string;
  readonly routeId: string;
  readonly transactionClass: TransactionClass;
  readonly probeIndex: number;
  readonly unitId: string;
  readonly signature: string;
  readonly outcome: MeasurementOutcome;
  readonly matchingValid: boolean;
  readonly pairingWindowBreached: boolean;
}

export interface WilsonInterval {
  readonly low: number;
  readonly high: number;
}

export interface CellMetrics {
  readonly routeId: string;
  readonly transactionClass: TransactionClass;
  readonly expectedCount: number;
  readonly completeCount: number;
  readonly missingCount: number;
  readonly invalidExclusionCount: number;
  readonly successCount: number;
  readonly inconclusiveCount: number;
  readonly pairingBreachCount: number;
  readonly successRate: number;
  readonly completeCaseSuccessRate: number | null;
  readonly inconclusiveRate: number;
  readonly wilson95: WilsonInterval;
}

export interface PeerRouteMetric {
  readonly routeId: string;
  readonly completeCount: number;
  readonly successRate: number;
  readonly inconclusiveRate: number;
}

export interface PeerBaseline {
  readonly excludedRouteId: string;
  readonly eligibleRouteIds: readonly string[];
  readonly completeCount: number;
  readonly successCount: number;
  readonly successRate: number | null;
  readonly routes: readonly PeerRouteMetric[];
}

export interface RouteClassification {
  readonly routeId: string;
  readonly classification: Classification;
  readonly evidenceStrength: EvidenceStrength;
  readonly reasons: readonly string[];
  readonly controlSuccessRate: number;
  readonly testSuccessRate: number;
  readonly absoluteClassGap: number;
  readonly peerTestBaseline: PeerBaseline;
}

export interface AnalysisSummary {
  readonly schemaVersion: typeof ANALYSIS_SCHEMA_VERSION;
  readonly policyVersion: typeof CLASSIFICATION_POLICY_VERSION;
  readonly inputHash: string;
  readonly definition: AnalysisWindowDefinition;
  readonly cells: readonly CellMetrics[];
  readonly classifications: readonly RouteClassification[];
  readonly invalidUnitIds: readonly string[];
  readonly duplicateSignatures: readonly string[];
}

