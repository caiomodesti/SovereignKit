import type { KeyPairSigner, Signature } from "@solana/kit";

export const PROBE_SCHEMA_VERSION = "0.1.0" as const;
export const MATCHING_PROFILE_VERSION = "MatchedProbeStructure@0.1.0" as const;
export const OBSERVATION_QUORUM_RULE_VERSION = "ObservationQuorum@0.1.0" as const;

export type TransactionClass = "MATCHED_CONTROL" | "PROGRAM_X";
export type ExperimentPhase = "healthy" | "degraded" | "asymmetric" | "insufficient_data";

export interface ProbeUnit {
  readonly experimentId: string;
  readonly experimentVersion: string;
  readonly phase: ExperimentPhase;
  readonly observerId: string;
  readonly routeId: string;
  readonly transactionClass: TransactionClass;
  readonly probeIndex: number;
  readonly unitId: string;
}

export interface ProbeDefinition {
  readonly experimentId: string;
  readonly experimentVersion: string;
  readonly phase: ExperimentPhase;
  readonly observerId: string;
  readonly routeIds: readonly string[];
  readonly transactionClasses: readonly TransactionClass[];
  readonly probeIndices: readonly number[];
  readonly randomizationSeed: string;
  readonly pairingWindowMs: number;
  readonly programAddress: string;
  readonly computeUnitLimit: number;
  readonly computeUnitPriceMicroLamports: bigint;
  readonly expectedComputeUnits: Readonly<Record<TransactionClass, number>>;
  readonly feePayerPolicy: string;
  readonly blockhashCommitment: "confirmed";
  readonly preflightCommitment: "confirmed";
  readonly skipPreflight: false;
  readonly maxRetries: 0;
}

export interface BlockhashLifetime {
  readonly blockhash: string;
  readonly lastValidBlockHeight: bigint;
  readonly contextSlot: bigint;
}

export interface ProbeBuildContext {
  readonly feePayer: KeyPairSigner;
  readonly lifetime: BlockhashLifetime;
}

export interface StructuralFingerprint {
  readonly version: typeof MATCHING_PROFILE_VERSION;
  readonly programAddress: string;
  readonly accountMetas: readonly {
    readonly address: string;
    readonly role: string;
  }[];
  readonly signerRoles: readonly string[];
  readonly instructionPrograms: readonly string[];
  readonly instructionDataLengths: readonly number[];
  readonly serializedSizeBytes: number;
  readonly computeUnitLimit: number;
  readonly computeUnitPriceMicroLamports: string;
  readonly feePayerPolicy: string;
  readonly expectedComputeUnits: number;
  readonly expectedResult: "success";
}

export interface BuiltProbe {
  readonly unit: ProbeUnit;
  readonly discriminator: 0 | 1;
  readonly pairNonceHex: string;
  readonly signature: Signature;
  readonly wireTransactionBase64: string;
  readonly fingerprint: StructuralFingerprint;
  readonly blockhash: string;
  readonly blockhashContextSlot: bigint;
  readonly lastValidBlockHeight: bigint;
}

export interface MatchingValidation {
  readonly valid: boolean;
  readonly profileVersion: typeof MATCHING_PROFILE_VERSION;
  readonly comparedUnitIds: readonly [string, string];
  readonly reasons: readonly string[];
}

export interface RandomizedProbeUnit extends ProbeUnit {
  readonly executionOrdinal: number;
}

export interface ProbeExecutionRecord {
  readonly unit: RandomizedProbeUnit;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcome: "COMPLETED" | "FAILED";
  readonly errorClass?: string;
}

export interface ProbeIndexExecutionWindow {
  readonly probeIndex: number;
  readonly firstStartAt: string;
  readonly lastStartAt: string;
  readonly spanMs: number;
  readonly pairingWindowMs: number;
  readonly breached: boolean;
}

export interface RandomizedExecutionResult {
  readonly seed: string;
  readonly records: readonly ProbeExecutionRecord[];
  readonly pairingWindows: readonly ProbeIndexExecutionWindow[];
}

export interface ProbeResultUnit {
  readonly experiment_id: string;
  readonly experiment_version: string;
  readonly phase: ExperimentPhase;
  readonly observer_id: string;
  readonly route_id: string;
  readonly transaction_class: TransactionClass;
  readonly probe_index: number;
  readonly unit_id: string;
}

export interface ProbeSubmission {
  readonly attempt_id: string;
  readonly attempt_number: 1;
  readonly outcome: "RPC_ACKNOWLEDGED" | "RPC_REJECTED";
  readonly blockhash: string;
  readonly blockhash_context_slot: number;
  readonly last_valid_block_height: number;
  readonly serialized_size_bytes: number;
  readonly created_at: string;
  readonly submitted_at: string;
  readonly response_at?: string;
  readonly rpc_error_code?: number | string;
  readonly rpc_error_category?: string;
}

export interface ReaderClaim {
  readonly claim_id: string;
  readonly reader_id: string;
  readonly observed_at: string;
  readonly signature_status: "processed" | "confirmed" | "finalized" | null;
  readonly rpc_context_slot?: number;
  readonly transaction_slot?: number;
  readonly execution_error?: unknown;
  readonly observed_block_height?: number;
  readonly reader_error?: string;
}

export interface QuorumDecision {
  readonly decision_id: string;
  readonly decision_type:
    | "OBSERVED_EXECUTION_SUCCESS"
    | "OBSERVED_EXECUTION_FAILED"
    | "CONFIRMED"
    | "FINALIZED"
    | "EXPIRED"
    | "OBSERVATION_INCONCLUSIVE";
  readonly supporting_claim_ids: readonly string[];
  readonly dissenting_claim_ids?: readonly string[];
  readonly decided_at: string;
  readonly quorum_rule_version: typeof OBSERVATION_QUORUM_RULE_VERSION;
}

export type ProbeTerminalState =
  | "OBSERVED_EXECUTION_FAILED"
  | "CONFIRMED"
  | "FINALIZED"
  | "EXPIRED"
  | "OBSERVATION_INCONCLUSIVE";

export interface UnsignedProbeResult {
  readonly schema_version: typeof PROBE_SCHEMA_VERSION;
  readonly result_id: string;
  readonly idempotency_key: string;
  readonly observer_id: string;
  readonly observer_key_id: string;
  readonly observer_sequence: number;
  readonly unit: ProbeResultUnit;
  readonly experiment_definition_hash: string;
  readonly signature: string;
  readonly submission: ProbeSubmission;
  readonly reader_claims: readonly ReaderClaim[];
  readonly quorum_decisions: readonly QuorumDecision[];
  readonly terminal_state: ProbeTerminalState;
  readonly observer_wall_time: string;
}

export interface SignedProbeResult extends UnsignedProbeResult {
  readonly payload_hash: string;
  readonly observer_signature: string;
}

export interface ObserverAllowlistEntry {
  readonly observerId: string;
  readonly keyId: string;
  readonly publicKeySpkiBase64: string;
  readonly validFrom: string;
  readonly validUntil?: string;
}
