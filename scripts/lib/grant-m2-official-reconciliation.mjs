import { createHash } from "node:crypto";

import { verifyObservationAssignment } from "../../packages/collector/dist/observation-assignment.js";
import { ProbeResultSchemaValidator } from "../../packages/collector/dist/validation.js";
import { canonicalJson } from "../../packages/probes/dist/canonical.js";
import { compatibleReaderClaims, evaluateReaderClaimQuorum } from "../../packages/probes/dist/reader-quorum.js";
import { verifyProbeResult } from "../../packages/probes/dist/signing.js";
import { grantM2OfficialScheduleHash } from "./grant-m2-official-schedule.mjs";
import { validateGrantM2OfficialRun } from "./grant-m2-official-run.mjs";

const TERMINAL_STATES = new Set([
  "FINALIZED",
  "CONFIRMED",
  "OBSERVED_EXECUTION_FAILED",
  "EXPIRED",
  "OBSERVATION_INCONCLUSIVE",
]);

export function reconcileGrantM2OfficialSlot({
  run,
  quota,
  slotId,
  entry,
  completion,
  unsignedResultText,
  rawText,
  deliveryReceiptText,
  collectorRecordText,
  observerAllowlistEntry,
  assignmentAuthorityEntry,
  probeResultSchema,
  recordedAt,
}) {
  validateGrantM2OfficialRun(run, quota);
  const slot = run.schedule.slots.find(candidate => candidate.slot_id === slotId);
  if (slot === undefined) throw new Error("M2 official reconciliation slot is not frozen in the schedule");
  validatePreparedEntry(entry, run, slot);
  const assignment = entry.assignment;
  const job = assignment.job;
  verifyObservationAssignment(assignment, assignmentAuthorityEntry, new Date(assignment.issuedAt));
  validateCompletion(completion, job);

  const unsigned = parseCanonicalJsonFile(unsignedResultText, "unsigned ProbeResult");
  const delivery = parseCanonicalJsonFile(deliveryReceiptText, "delivery receipt");
  const signed = { ...unsigned, payload_hash: delivery.payload_hash, observer_signature: delivery.observer_signature };
  const collectorRecord = parseCanonicalJsonFile(collectorRecordText, "Collector accepted record");
  const schemaResult = new ProbeResultSchemaValidator(probeResultSchema).validate(signed);
  if (!schemaResult.valid) throw new Error(`M2 official signed result schema validation failed: ${schemaResult.errors.join("; ")}`);
  validateResultBindings(signed, assignment, slot, run);
  if (completion.terminalState !== signed.terminal_state) {
    throw new Error("M2 official remote worker completion terminal state does not match the signed result");
  }
  validateObserverIdentity(signed, observerAllowlistEntry, delivery, recordedAt);
  if (!verifyProbeResult(signed, observerAllowlistEntry)) throw new Error("M2 official observer signature or payload hash is invalid");
  validateDelivery(delivery, signed);
  validateCollectorRecord(collectorRecord, signed, recordedAt);
  recomputeRawToDerived({ rawText, assignment, signed });

  return {
    signed_result: signed,
    delivery_receipt: delivery,
    terminal_event: {
      event: "SLOT_TERMINAL",
      recorded_at: canonicalTimestamp(recordedAt),
      slot_id: slot.slot_id,
      cycle_index: slot.cycle_index,
      observer_id: slot.observer_id,
      route_id: slot.route_id,
      terminal_status: "QUALIFYING",
      qualifying_units: 1,
      result_id: signed.result_id,
      signature: signed.signature,
      observation_terminal_state: signed.terminal_state,
      raw_sha256: sha256(rawText),
      signed_result_sha256: sha256(`${JSON.stringify(signed)}\n`),
      delivery_receipt_sha256: sha256(deliveryReceiptText),
      collector_record_sha256: sha256(collectorRecordText),
      collector_status: delivery.collector_status,
      raw_to_derived_recomputed: true,
      observer_signature_verified: true,
      collector_receipt_bound: true,
    },
  };
}

function validateCollectorRecord(record, signed, recordedAt) {
  const collectedAt = Date.parse(record?.collected_at);
  const observedAt = Date.parse(signed.observer_wall_time);
  const reconciledAt = Date.parse(canonicalTimestamp(recordedAt));
  if (!Number.isSafeInteger(record?.collector_sequence) || record.collector_sequence < 0 || !Number.isFinite(collectedAt) ||
      new Date(collectedAt).toISOString() !== record.collected_at || collectedAt < observedAt || collectedAt > reconciledAt ||
      canonicalJson(record.result) !== canonicalJson(signed)) {
    throw new Error("M2 official Collector durable record is not exactly bound to the signed result");
  }
}

function validatePreparedEntry(entry, run, slot) {
  const assignment = entry?.assignment;
  const job = assignment?.job;
  if (entry?.schema_version !== "GrantM2PreparedDispatch@0.1.0" || entry.execution_scope !== "M2_OFFICIAL_FOURTEEN_DAY_WINDOW" ||
      entry.schedule_sha256 !== grantM2OfficialScheduleHash(run.schedule) || entry.slot_id !== slot.slot_id ||
      assignment?.schemaVersion !== "ObservationAssignment@0.1.0" || job?.schemaVersion !== "ObservationJob@0.1.0") {
    throw new Error("M2 official prepared entry is invalid or outside the frozen schedule");
  }
}

function validateCompletion(completion, job) {
  if (completion?.event !== "M2_OBSERVATION_JOB_COMPLETED" || completion.resultId !== job.resultId ||
      completion.terminalState === undefined || !TERMINAL_STATES.has(completion.terminalState) || completion.qualifyingUnits !== 0) {
    throw new Error("M2 official remote worker completion is invalid");
  }
}

function validateResultBindings(result, assignment, slot, run) {
  const job = assignment.job;
  const unit = result.unit;
  if (result.result_id !== job.resultId || result.observer_id !== job.observerId || result.observer_key_id !== job.observerKeyId ||
      result.observer_sequence !== job.observerSequence || result.experiment_definition_hash !== job.experimentDefinitionHash ||
      result.experiment_definition_hash !== run.schedule.precommitment_sha256 || result.signature !== job.signature ||
      canonicalJson(result.submission) !== canonicalJson(job.submission) || result.terminal_state === undefined ||
      unit?.experiment_id !== "sovereignkit-grant-m2-public-pilot" || unit.experiment_version !== "1" || unit.phase !== "healthy" ||
      unit.observer_id !== slot.observer_id || unit.route_id !== slot.route_id || unit.transaction_class !== "MATCHED_CONTROL" ||
      unit.probe_index !== slot.cycle_index || canonicalJson(unit) !== canonicalJson(job.unit)) {
    throw new Error("M2 official result does not match its assignment and frozen statistical unit");
  }
}

function validateObserverIdentity(result, entry, delivery, recordedAt) {
  const observed = Date.parse(result.observer_wall_time);
  const delivered = Date.parse(delivery.delivered_at);
  const recorded = Date.parse(canonicalTimestamp(recordedAt));
  const validFrom = Date.parse(entry?.validFrom);
  const validUntil = entry?.validUntil === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.validUntil);
  if (result.observer_id !== entry?.observerId || result.observer_key_id !== entry?.keyId || !Number.isFinite(observed) ||
      !Number.isFinite(delivered) || !Number.isFinite(validFrom) || Number.isNaN(validUntil) || validUntil <= validFrom ||
      observed < validFrom || observed > validUntil || delivered < observed || delivered > validUntil || recorded < delivered) {
    throw new Error("M2 official observer identity is invalid or outside its key validity interval");
  }
}

function validateDelivery(delivery, signed) {
  if (!Number.isSafeInteger(delivery?.delivery_sequence) || delivery.delivery_sequence < 0 ||
      delivery.result_id !== signed.result_id || delivery.idempotency_key !== signed.idempotency_key ||
      delivery.payload_hash !== signed.payload_hash || delivery.observer_signature !== signed.observer_signature ||
      delivery.collector_status !== "ACCEPTED" || delivery.collector_origin !== "https://collector.sovereignkit.org") {
    throw new Error("M2 official Collector receipt is not an original accepted delivery bound to the signed result");
  }
}

function recomputeRawToDerived({ rawText, assignment, signed }) {
  const polls = parseJsonl(rawText, "raw observations");
  let previousObservedAt = Number.NEGATIVE_INFINITY;
  let priorLedgerObservation = false;
  let derived;
  for (let index = 0; index < polls.length; index += 1) {
    const poll = polls[index];
    const observedAt = Date.parse(poll?.observed_at);
    if (poll?.schema_version !== "RawObservationPoll@0.2.0" || poll.assignment_id !== assignment.assignmentId ||
        poll.assignment_payload_hash !== assignment.payloadHash || poll.poll_index !== index || poll.observer_id !== signed.observer_id ||
        poll.signature !== signed.signature || !Number.isFinite(observedAt) || observedAt < previousObservedAt ||
        observedAt < Date.parse(assignment.issuedAt) || observedAt > Date.parse(assignment.expiresAt)) {
      throw new Error("M2 official raw observation provenance, order or clock is invalid");
    }
    previousObservedAt = observedAt;
    validateClaims(poll.claims, poll.observed_at);
    const decision = evaluateReaderClaimQuorum(poll.claims, assignment.job.submission.last_valid_block_height, priorLedgerObservation);
    priorLedgerObservation ||= poll.claims.some(claim => claim.signature_status !== null);
    if (decision.terminal !== undefined) {
      if (index !== polls.length - 1) throw new Error("M2 official raw observations continue after terminal quorum");
      derived = { terminal: decision.terminal, claims: poll.claims, supporting: decision.supportingClaims };
    }
  }
  if (Date.parse(signed.observer_wall_time) < previousObservedAt || Date.parse(signed.observer_wall_time) > Date.parse(assignment.expiresAt) ||
      signed.quorum_decisions?.at(-1)?.decided_at !== signed.observer_wall_time) {
    throw new Error("M2 official signed result clock does not follow its raw evidence and assignment validity");
  }
  if (derived === undefined) derived = deriveDeadlineTerminal(polls, assignment, signed);
  const decision = signed.quorum_decisions?.at(-1);
  if (derived.terminal !== signed.terminal_state || canonicalJson(derived.claims) !== canonicalJson(signed.reader_claims) ||
      signed.quorum_decisions?.length !== 1 || decision?.decision_type !== derived.terminal ||
      canonicalJson([...decision.supporting_claim_ids].sort()) !== canonicalJson(derived.supporting.map(claim => claim.claim_id).sort())) {
    throw new Error("M2 official raw-to-derived result or supporting quorum does not match the signed result");
  }
}

function deriveDeadlineTerminal(polls, assignment, signed) {
  const first = polls[0];
  const last = polls.at(-1);
  if (Date.parse(signed.observer_wall_time) - Date.parse(first.observed_at) < assignment.job.observationDeadlineMs) {
    throw new Error("M2 official deadline terminal state was emitted before the observation deadline");
  }
  const confirmed = compatibleReaderClaims(last.claims.filter(claim =>
    (claim.signature_status === "confirmed" || claim.signature_status === "finalized") && claim.execution_error === undefined));
  if (confirmed.length >= 2) return { terminal: "CONFIRMED", claims: last.claims, supporting: confirmed.slice(0, 2) };
  return { terminal: "OBSERVATION_INCONCLUSIVE", claims: last.claims, supporting: last.claims.slice(0, 2) };
}

function validateClaims(claims, observedAt) {
  if (!Array.isArray(claims) || claims.length !== 3 || new Set(claims.map(claim => claim?.reader_id)).size !== 3 ||
      new Set(claims.map(claim => claim?.claim_id)).size !== 3) throw new Error("M2 official raw poll requires three unique readers and claim IDs");
  for (const claim of claims) {
    if (typeof claim.claim_id !== "string" || typeof claim.reader_id !== "string" || claim.observed_at !== observedAt ||
        ![null, "processed", "confirmed", "finalized"].includes(claim.signature_status)) {
      throw new Error("M2 official raw reader claim is invalid");
    }
  }
}

function parseCanonicalJsonFile(text, label) {
  if (typeof text !== "string" || !text.endsWith("\n") || text.trimEnd().includes("\n")) throw new Error(`${label} must be one complete newline-terminated JSON record`);
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`${label} is invalid JSON`); }
  if (text !== `${JSON.stringify(value)}\n`) throw new Error(`${label} is not canonical`);
  return value;
}

function parseJsonl(text, label) {
  if (typeof text !== "string" || text.length === 0 || !text.endsWith("\n")) throw new Error(`${label} is empty or partial`);
  return text.trimEnd().split("\n").map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`${label} contains invalid JSON at record ${index}`); }
  });
}

function canonicalTimestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) throw new Error("M2 official reconciliation timestamp must be canonical UTC");
  return value;
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
