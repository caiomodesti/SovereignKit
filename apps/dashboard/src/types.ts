export type Classification = "HEALTHY" | "DEGRADED" | "ASYMMETRIC" | "INSUFFICIENT_DATA";
export type TransactionClass = "MATCHED_CONTROL" | "PROGRAM_X";

export interface ExperimentCell {
  readonly routeId: string;
  readonly transactionClass: TransactionClass;
  readonly expectedCount: number;
  readonly completeCount: number;
  readonly successCount: number;
  readonly successRate: number | null;
  readonly inconclusiveCount: number;
  readonly inconclusiveRate: number;
  readonly missingCount: number;
  readonly invalidExclusionCount: number;
  readonly pairingBreachCount: number;
  readonly wilson95: { readonly low: number | null; readonly high: number | null };
}

export interface RouteClassification {
  readonly routeId: string;
  readonly classification: Classification;
  readonly evidenceStrength: "INSUFFICIENT" | "LIMITED" | "STRONG_CONTROLLED";
  readonly controlSuccessRate: number | null;
  readonly testSuccessRate: number | null;
  readonly absoluteClassGap: number | null;
  readonly reasons: readonly string[];
}

export interface Scenario {
  readonly id: "healthy" | "degraded" | "asymmetric" | "insufficient_data";
  readonly label: Classification;
  readonly inputHash: string;
  readonly signedResultCount: number;
  readonly acknowledgedCount: number;
  readonly rejectedCount: number;
  readonly definition: {
    readonly experimentId: string;
    readonly experimentVersion: string;
    readonly observerId: string;
    readonly phase: string;
    readonly routeIds: readonly string[];
    readonly probeIndices: readonly number[];
    readonly windowId: string;
    readonly configurationHash: string;
  };
  readonly classifications: readonly RouteClassification[];
  readonly cells: readonly ExperimentCell[];
}

export interface DashboardDataset {
  readonly schemaVersion: "DashboardDataset@0.1.0";
  readonly evidenceGeneratedAt: string;
  readonly agaveVersion: string;
  readonly programAddress: string;
  readonly sourceFiles: readonly string[];
  readonly overview: {
    readonly scenarioCount: number;
    readonly routeCount: number;
    readonly observerCount: number;
    readonly signedResultCount: number;
  };
  readonly observers: readonly {
    readonly observerId: string;
    readonly keyId: string;
    readonly publicKeySpkiBase64: string;
  }[];
  readonly observationLimitation: string;
  readonly scenarios: readonly Scenario[];
  readonly feed: {
    readonly version: number;
    readonly generatedAt: string;
    readonly expiresAt: string;
    readonly inputHash: string;
    readonly policyId: string;
    readonly dispositionAfterOneSnapshot: "LOCAL_PRIMARY_FALLBACK" | "AVOID";
    readonly routeIntelligence: readonly {
      readonly routeId: string;
      readonly transactionClass: TransactionClass;
      readonly classification: Classification;
      readonly evidenceStrength: string;
      readonly sampleCount: number;
      readonly observedAt: string;
    }[];
  };
  readonly failover: {
    readonly evidenceVersion: string;
    readonly generatedAt: string;
    readonly transactionSignature: string;
    readonly finalState: string;
    readonly confirmationObservedAfterRouteId: string;
    readonly attempts: readonly {
      readonly attemptNumber: number;
      readonly routeId: string;
      readonly submissionOutcome: "RPC_REJECTED" | "RPC_ACKNOWLEDGED";
      readonly observationState?: string;
    }[];
    readonly observationIndependence: string;
    readonly primaryFailureMode: string;
  };
}
