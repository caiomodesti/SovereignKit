import { canonicalJson } from "./canonical.js";
import { verifyProbeResult } from "./signing.js";
import { deriveIdempotencyKey } from "./signing.js";
import { deriveUnitId } from "./units.js";
import type { ObserverAllowlistEntry, SignedProbeResult } from "./types.js";

export type IngestionOutcome =
  | { readonly status: "ACCEPTED"; readonly storedCount: number }
  | { readonly status: "DUPLICATE"; readonly storedCount: number }
  | { readonly status: "REJECTED"; readonly reason: string; readonly storedCount: number };

export class IdempotentProbeResultIngestor {
  readonly #allowlist: Map<string, ObserverAllowlistEntry>;
  readonly #byResultId = new Map<string, SignedProbeResult>();
  readonly #byIdempotencyKey = new Map<string, SignedProbeResult>();
  readonly #byObserverSequence = new Map<string, SignedProbeResult>();
  readonly #accepted: SignedProbeResult[] = [];

  constructor(entries: readonly ObserverAllowlistEntry[]) {
    this.#allowlist = new Map(entries.map(entry => [`${entry.observerId}\u001f${entry.keyId}`, entry]));
    if (this.#allowlist.size !== entries.length) throw new Error("allowlist contains duplicate observer/key entries");
  }

  ingest(result: SignedProbeResult, collectorTime = new Date()): IngestionOutcome {
    const outcome = this.assess(result, collectorTime);
    if (outcome.status === "ACCEPTED") this.#commit(result);
    return outcome;
  }

  assess(result: SignedProbeResult, collectorTime = new Date()): IngestionOutcome {
    const schemaError = validateResultShape(result);
    if (schemaError !== undefined) return this.#rejected(schemaError);
    const entry = this.#allowlist.get(`${result.observer_id}\u001f${result.observer_key_id}`);
    if (entry === undefined) return this.#rejected("observer key is not allowlisted");
    const observedAt = Date.parse(result.observer_wall_time);
    const validFrom = Date.parse(entry.validFrom);
    const validUntil = entry.validUntil === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.validUntil);
    const collectedAt = collectorTime.getTime();
    if (!Number.isFinite(observedAt) || !Number.isFinite(validFrom) || !Number.isFinite(validUntil) || !Number.isFinite(collectedAt) ||
        observedAt < validFrom || observedAt > validUntil || collectedAt < validFrom || collectedAt > validUntil) {
      return this.#rejected("observer key is outside its validity interval");
    }
    try {
      if (!verifyProbeResult(result, entry)) return this.#rejected("observer signature or payload hash is invalid");
    } catch {
      return this.#rejected("observer signature or public key encoding is invalid");
    }

    const existingByResult = this.#byResultId.get(result.result_id);
    const existingByIdempotency = this.#byIdempotencyKey.get(result.idempotency_key);
    const sequenceKey = sequenceKeyFor(result);
    const existingBySequence = this.#byObserverSequence.get(sequenceKey);
    const existing = existingByResult ?? existingByIdempotency ?? existingBySequence;
    if (existing !== undefined) {
      if (canonicalJson(existing) === canonicalJson(result)) return { status: "DUPLICATE", storedCount: this.#accepted.length };
      return this.#rejected("result_id, idempotency_key, or observer_sequence conflicts with an existing result");
    }
    return { status: "ACCEPTED", storedCount: this.#accepted.length + 1 };
  }

  #commit(result: SignedProbeResult): void {
    const sequenceKey = sequenceKeyFor(result);
    if (this.#byResultId.has(result.result_id) || this.#byIdempotencyKey.has(result.idempotency_key) || this.#byObserverSequence.has(sequenceKey)) {
      throw new Error("cannot commit a ProbeResult that conflicts with current ingestion state");
    }
    this.#byResultId.set(result.result_id, result);
    this.#byIdempotencyKey.set(result.idempotency_key, result);
    this.#byObserverSequence.set(sequenceKey, result);
    this.#accepted.push(result);
  }

  acceptedResults(): readonly SignedProbeResult[] { return [...this.#accepted]; }

  #rejected(reason: string): IngestionOutcome {
    return { status: "REJECTED", reason, storedCount: this.#accepted.length };
  }
}

function sequenceKeyFor(result: SignedProbeResult): string {
  return `${result.observer_id}\u001f${result.experiment_definition_hash}\u001f${result.observer_sequence}`;
}

function validateResultShape(result: SignedProbeResult): string | undefined {
  if (result.schema_version !== "0.1.0") return "unsupported schema_version";
  if (!/^[0-9a-f]{64}$/.test(result.idempotency_key)) return "invalid idempotency_key";
  if (!/^[0-9a-f]{64}$/.test(result.experiment_definition_hash)) return "invalid experiment_definition_hash";
  if (!/^[0-9a-f]{64}$/.test(result.payload_hash)) return "invalid payload_hash";
  if (result.idempotency_key !== deriveIdempotencyKey(result.observer_id, result.unit.unit_id)) return "idempotency_key does not match observer and unit";
  if (!/^[0-9a-f]{64}$/.test(result.unit.unit_id)) return "invalid unit_id";
  if (!/^[0-9a-f]{64}$/.test(result.experiment_definition_hash)) return "invalid experiment_definition_hash";
  if (!/^[0-9a-f]{64}$/.test(result.payload_hash)) return "invalid payload_hash";
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result.result_id)) return "invalid result_id";
  if (result.signature.length < 80 || result.signature.length > 90) return "invalid transaction signature";
  if (result.observer_sequence < 0 || !Number.isSafeInteger(result.observer_sequence)) return "invalid observer_sequence";
  if (result.unit.observer_id !== result.observer_id) return "unit observer_id mismatch";
  const derivedUnitId = deriveUnitId({
    experimentId: result.unit.experiment_id,
    experimentVersion: result.unit.experiment_version,
    phase: result.unit.phase,
    observerId: result.unit.observer_id,
    routeId: result.unit.route_id,
    transactionClass: result.unit.transaction_class,
    probeIndex: result.unit.probe_index,
  });
  if (result.unit.unit_id !== derivedUnitId) return "unit_id does not match the statistical unit tuple";
  if (result.submission.attempt_number !== 1) return "only one submission attempt is permitted";
  if (result.quorum_decisions.some(decision => new Set(decision.supporting_claim_ids).size < 2)) return "quorum decision has fewer than two distinct supporting claims";
  const claimsById = new Map(result.reader_claims.map(claim => [claim.claim_id, claim]));
  const claimIds = new Set(claimsById.keys());
  if (result.quorum_decisions.some(decision => decision.supporting_claim_ids.some(id => !claimIds.has(id)))) return "quorum decision references an unknown claim";
  if (result.quorum_decisions.some(decision => new Set(decision.supporting_claim_ids.map(id => claimsById.get(id)!.reader_id)).size < 2)) {
    return "quorum decision has fewer than two distinct readers";
  }
  const terminalDecision = result.quorum_decisions.at(-1)?.decision_type;
  if (terminalDecision !== result.terminal_state) return "terminal_state does not match the final quorum decision";
  return undefined;
}
