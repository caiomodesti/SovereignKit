export const SCHEMA_VERSION = "1" as const;
export const MEASUREMENT_VERSION = "sovereign-telemetry-v0.1" as const;
export const OBSERVATION_QUORUM_VERSION = "logical-observation-quorum-v0.1" as const;

export type LifecycleState =
  | "CREATED"
  | "SUBMISSION_ATTEMPTED"
  | "RPC_ACKNOWLEDGED"
  | "RPC_REJECTED"
  | "OBSERVATION_PENDING"
  | "OBSERVED_EXECUTION_SUCCESS"
  | "OBSERVED_EXECUTION_FAILED"
  | "CONFIRMED"
  | "FINALIZED"
  | "EXPIRED"
  | "OBSERVATION_INCONCLUSIVE";

export type SignatureStatus = "processed" | "confirmed" | "finalized";
export type ExecutionOutcome = "success" | "failed" | "not_observed";

export interface ObserverIdentityReference {
  readonly observerId: string;
  readonly keyId: string;
  readonly publicKey: string;
  readonly validFrom: string;
  readonly validUntil?: string;
}

export interface TransactionValidity {
  readonly blockhash: string;
  readonly fetchedAt: string;
  readonly contextSlot: bigint;
  readonly lastValidBlockHeight: bigint;
  readonly blockhashCommitment: "confirmed";
}

export interface TransactionDescriptor {
  readonly transactionId: string;
  readonly attemptId: string;
  readonly routeId: string;
  readonly signature: string;
  readonly validity: TransactionValidity;
  readonly experimentId?: string;
  readonly probeId?: string;
}

export interface RpcErrorFact {
  readonly category: "PRE_FLIGHT" | "RPC" | "TRANSPORT" | "TIMEOUT" | "UNKNOWN";
  readonly code?: number | string;
  readonly messageClass?: string;
  readonly mayHaveBeenForwarded: boolean;
}

export interface ReaderSignatureFact {
  readonly observationId: string;
  readonly readerId: string;
  readonly status: SignatureStatus | null;
  readonly slot?: bigint;
  readonly executionError?: unknown;
  readonly rpcContextSlot?: bigint;
}

export interface ReaderBlockHeightFact {
  readonly observationId: string;
  readonly readerId: string;
  readonly blockHeight: bigint;
  readonly commitment: "confirmed";
}

export interface ReaderUnavailableFact {
  readonly observationId: string;
  readonly readerId: string;
  readonly operation: "signature_status" | "block_height";
  readonly errorCategory: "TRANSPORT" | "TIMEOUT" | "RPC" | "UNKNOWN";
}

export interface MeasurementEventBase<Type extends string, Data> {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly measurementVersion: typeof MEASUREMENT_VERSION;
  readonly softwareVersion: string;
  readonly eventId: string;
  readonly eventType: Type;
  readonly attemptId: string;
  readonly transactionId: string;
  readonly observerId: string;
  readonly keyId: string;
  readonly clockDomainId: string;
  readonly sequence: number;
  readonly wallClock: string;
  readonly monotonicNs: string;
  readonly collectorReceivedAt?: string;
  readonly data: Data;
}

export type TransactionCreatedEvent = MeasurementEventBase<
  "TRANSACTION_CREATED",
  TransactionDescriptor
>;

export type SubmissionAttemptedEvent = MeasurementEventBase<
  "SUBMISSION_ATTEMPTED_RECORDED",
  { readonly routeId: string }
>;

export type RpcResponseEvent = MeasurementEventBase<
  "RPC_RESPONSE_RECEIVED",
  | { readonly outcome: "acknowledged"; readonly returnedSignature: string }
  | { readonly outcome: "rejected"; readonly error: RpcErrorFact }
>;

export type ObservationCycleStartedEvent = MeasurementEventBase<
  "OBSERVATION_CYCLE_STARTED",
  { readonly readerIds: readonly string[]; readonly requiredQuorum: number }
>;

export type ReaderSignatureStatusEvent = MeasurementEventBase<
  "READER_SIGNATURE_STATUS_RECEIVED",
  ReaderSignatureFact
>;

export type ReaderBlockHeightEvent = MeasurementEventBase<
  "READER_BLOCK_HEIGHT_RECEIVED",
  ReaderBlockHeightFact
>;

export type ReaderUnavailableEvent = MeasurementEventBase<
  "READER_UNAVAILABLE",
  ReaderUnavailableFact
>;

export type ObservationDeadlineEvent = MeasurementEventBase<
  "OBSERVATION_DEADLINE_REACHED",
  { readonly deadlineMs: number }
>;

export type MeasurementEvent =
  | TransactionCreatedEvent
  | SubmissionAttemptedEvent
  | RpcResponseEvent
  | ObservationCycleStartedEvent
  | ReaderSignatureStatusEvent
  | ReaderBlockHeightEvent
  | ReaderUnavailableEvent
  | ObservationDeadlineEvent;

export interface LifecycleEntry {
  readonly state: LifecycleState;
  readonly sourceEventIds: readonly string[];
  readonly wallClock: string;
  readonly monotonicNs: string;
}

export interface QuorumSupport {
  readonly version: typeof OBSERVATION_QUORUM_VERSION;
  readonly required: number;
  readonly observedSuccessReaderIds: readonly string[];
  readonly observedFailureReaderIds: readonly string[];
  readonly confirmedReaderIds: readonly string[];
  readonly finalizedReaderIds: readonly string[];
  readonly expiredHeightReaderIds: readonly string[];
  readonly hasAnyLedgerObservation: boolean;
  readonly inconsistentExecutionClaims: boolean;
}

export interface TransactionTimeline {
  readonly transactionId: string;
  readonly attemptId: string;
  readonly experimentId?: string;
  readonly probeId?: string;
  readonly routeId: string;
  readonly signature: string;
  readonly validity: TransactionValidity;
  readonly lifecycle: readonly LifecycleEntry[];
  readonly derivedState: LifecycleState;
  readonly executionOutcome: ExecutionOutcome;
  readonly quorum: QuorumSupport;
  readonly durations: {
    readonly rpcResponseMs?: number;
    readonly observedMs?: number;
    readonly confirmedMs?: number;
    readonly finalizedMs?: number;
    readonly expiredMs?: number;
  };
  readonly rawEventCount: number;
  readonly effectiveObservationCount: number;
  readonly anomalies: readonly string[];
}
