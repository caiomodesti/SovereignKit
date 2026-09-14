import { randomUUID } from "node:crypto";

import { signObservationAssignment } from "../../packages/collector/dist/observation-assignment.js";
import { validateObservationJob } from "../../packages/collector/dist/observation-worker.js";
import { deriveUnitId } from "../../packages/probes/dist/units.js";
import { grantM2OfficialScheduleHash } from "./grant-m2-official-schedule.mjs";
import { validateGrantM2OfficialRun } from "./grant-m2-official-run.mjs";

const READERS = ["grant-m2-reader-public-a", "grant-m2-reader-alchemy", "grant-m2-reader-public-b"].map(readerId => ({ readerId }));

export async function prepareAndSubmitGrantM2OfficialSlot({
  run,
  quota,
  slotId,
  observerKeyId,
  signer,
  sequenceJournal,
  slotJournal,
  prepareTransaction,
  submitTransaction,
  nowAt,
  now = () => new Date(),
}) {
  validateGrantM2OfficialRun(run, quota);
  const current = canonicalTime(nowAt);
  const slot = run.schedule.slots.find(candidate => candidate.slot_id === slotId);
  if (!slot || current < canonicalTime(slot.due_at) || current > canonicalTime(slot.due_at) + run.schedule.slot_lateness_tolerance_ms) {
    throw new Error("M2 official slot is unknown or outside its frozen execution tolerance");
  }
  if (typeof observerKeyId !== "string" || observerKeyId.length === 0 || typeof signer?.issuerId !== "string" ||
      typeof sequenceJournal?.reserve !== "function" || typeof slotJournal?.reserve !== "function" ||
      typeof prepareTransaction !== "function" || typeof submitTransaction !== "function") {
    throw new Error("M2 official slot runner configuration is invalid");
  }
  const identity = {
    experimentId: "sovereignkit-grant-m2-public-pilot",
    experimentVersion: "1",
    phase: "healthy",
    observerId: slot.observer_id,
    routeId: slot.route_id,
    transactionClass: "MATCHED_CONTROL",
    probeIndex: slot.cycle_index,
  };
  const unit = { ...identity, unitId: deriveUnitId(identity) };
  const assignmentId = randomUUID();
  const reservation = await slotJournal.reserve({
    scheduleHash: grantM2OfficialScheduleHash(run.schedule),
    slotId,
    unitId: unit.unitId,
    observerId: slot.observer_id,
    reservedAt: nowAt,
  });
  if (reservation.status !== "RESERVED") return { status: "RECONCILIATION_REQUIRED", slot_id: slotId };
  const sequence = await sequenceJournal.reserve({ slotId, unitId: unit.unitId, assignmentId, reservedAt: nowAt });
  if (sequence.status !== "RESERVED") {
    await reservation.markUncertain("OBSERVER_SEQUENCE", { reason: "observer_sequence_reconciliation_required" }, canonicalNow(now));
    return { status: "RECONCILIATION_REQUIRED", slot_id: slotId };
  }
  let prepared;
  try {
    prepared = await prepareTransaction(unit);
    await reservation.record("TRANSACTION_PREPARED", sanitizedPrepared(prepared), canonicalNow(now));
  } catch (error) {
    await reservation.markUncertain("TRANSACTION_PREPARED", { error_class: errorClass(error) }, canonicalNow(now));
    return { status: "RECONCILIATION_REQUIRED", slot_id: slotId };
  }
  let submitted;
  try {
    submitted = await submitTransaction(prepared);
    if (submitted?.signature !== prepared.signature) throw new Error("submitted signature does not match prepared transaction");
    await reservation.record("SUBMISSION_ACKNOWLEDGED", { signature: submitted.signature, submission: submitted.submission }, canonicalNow(now));
  } catch (error) {
    await reservation.markUncertain("SUBMISSION_ACKNOWLEDGED", { signature: prepared.signature, error_class: errorClass(error) }, canonicalNow(now));
    return { status: "RECONCILIATION_REQUIRED", slot_id: slotId };
  }
  const issuedAt = canonicalNow(now);
  const job = {
    schemaVersion: "ObservationJob@0.1.0",
    resultId: randomUUID(),
    observerId: slot.observer_id,
    observerKeyId,
    observerSequence: sequence.record.observer_sequence,
    unit: {
      experiment_id: identity.experimentId,
      experiment_version: identity.experimentVersion,
      phase: identity.phase,
      observer_id: identity.observerId,
      route_id: identity.routeId,
      transaction_class: identity.transactionClass,
      probe_index: identity.probeIndex,
      unit_id: unit.unitId,
    },
    experimentDefinitionHash: run.schedule.precommitment_sha256,
    signature: submitted.signature,
    submission: submitted.submission,
    pollIntervalMs: 5_000,
    observationDeadlineMs: 120_000,
    readerRequestTimeoutMs: 10_000,
  };
  validateObservationJob(job, READERS);
  const assignment = signObservationAssignment({
    schemaVersion: "ObservationAssignment@0.1.0",
    assignmentId,
    issuerId: signer.issuerId,
    issuerKeyId: signer.keyId,
    issuedAt,
    expiresAt: new Date(canonicalTime(issuedAt) + 180_000).toISOString(),
    job,
  }, signer);
  const entry = {
    schema_version: "GrantM2PreparedDispatch@0.1.0",
    execution_scope: "M2_OFFICIAL_FOURTEEN_DAY_WINDOW",
    schedule_sha256: grantM2OfficialScheduleHash(run.schedule),
    slot_id: slotId,
    assignment,
  };
  await reservation.record("ASSIGNMENT_PREPARED", { entry }, canonicalNow(now));
  return { status: "ASSIGNMENT_PREPARED", slot_id: slotId, entry };
}

function sanitizedPrepared(value) {
  if (typeof value?.signature !== "string" || typeof value?.wireTransactionBase64 !== "string") throw new Error("prepared transaction is invalid");
  const { endpoint: _endpoint, ...safe } = value;
  return safe;
}
function canonicalTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) throw new Error("canonical UTC timestamp required");
  return parsed;
}
function canonicalNow(now) {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error("M2 official slot runner clock is invalid");
  return value.toISOString();
}
function errorClass(error) { return error instanceof Error && /^[A-Za-z][A-Za-z0-9]*$/u.test(error.name) ? error.name : "UnknownError"; }
