import { randomUUID } from 'node:crypto';

import { deriveUnitId } from '../../packages/probes/dist/units.js';
import { prepareRehearsalDispatch, scheduleHash } from './grant-m2-dispatch.mjs';
import { reserveM2RehearsalSlot } from './grant-m2-slot-journal.mjs';

export async function prepareAndSubmitM2RehearsalSlot({ schedule, slotId, authorization, observerKeyId, signer, sequenceJournal, slotJournalDirectory, prepareTransaction, submitTransaction, nowAt, now = () => new Date() }) {
  const hash = scheduleHash(schedule);
  const current = timestamp(nowAt);
  if (authorization?.authorized !== true || authorization.scope !== 'PRE_M2_REHEARSAL_ONLY' || authorization.schedule_sha256 !== hash ||
      current < timestamp(authorization.not_before) || current > timestamp(authorization.not_after)) throw Error('M2 rehearsal slot is not authorized');
  const slot = schedule?.slots?.find(item => item.slot_id === slotId);
  if (schedule.mode !== 'DRY_RUN_ONLY' || schedule.rehearsal_started !== false || schedule.milestone_2_started !== false || slot === undefined ||
      current < timestamp(slot.due_at) || current > timestamp(slot.due_at) + 10_000) throw Error('M2 rehearsal slot is not due');
  if (typeof observerKeyId !== 'string' || observerKeyId.length === 0 || typeof prepareTransaction !== 'function' || typeof submitTransaction !== 'function') throw Error('Invalid M2 rehearsal slot runner configuration');
  const identity = {
    experimentId: `m2-rehearsal-${schedule.run_id}`, experimentVersion: '1', phase: 'healthy', observerId: slot.observer_id,
    routeId: slot.route_id, transactionClass: 'MATCHED_CONTROL', probeIndex: slot.cycle_index,
  };
  const unit = { ...identity, unitId: deriveUnitId(identity) };
  const assignmentId = randomUUID();
  const journal = await reserveM2RehearsalSlot({ directory: slotJournalDirectory, scheduleHash: hash, slotId, unitId: unit.unitId, observerId: slot.observer_id, reservedAt: nowAt });
  if (journal.status !== 'RESERVED') return journal;
  const sequence = await sequenceJournal.reserve({ slotId, unitId: unit.unitId, assignmentId, reservedAt: nowAt });
  if (sequence.status !== 'RESERVED') {
    await journal.markUncertain('TRANSACTION_PREPARED', { reason: 'observer_sequence_reconciliation_required' }, canonicalNow(now));
    return { status: 'RECONCILIATION_REQUIRED', slot_id: slotId };
  }
  let prepared;
  try {
    prepared = await prepareTransaction(unit);
    await journal.record('TRANSACTION_PREPARED', sanitizedPrepared(prepared), canonicalNow(now));
  } catch (error) {
    await journal.markUncertain('TRANSACTION_PREPARED', { error_class: errorClass(error) }, canonicalNow(now));
    return { status: 'RECONCILIATION_REQUIRED', slot_id: slotId };
  }
  let submitted;
  try {
    submitted = await submitTransaction(prepared);
    if (submitted?.signature !== prepared.signature) throw Error('Submitted signature does not match prepared transaction');
    await journal.record('SUBMISSION_ACKNOWLEDGED', { signature: submitted.signature, submission: submitted.submission }, canonicalNow(now));
  } catch (error) {
    await journal.markUncertain('SUBMISSION_ACKNOWLEDGED', { signature: prepared.signature, error_class: errorClass(error) }, canonicalNow(now));
    return { status: 'RECONCILIATION_REQUIRED', slot_id: slotId };
  }
  const issuedAt = canonicalNow(now);
  const job = {
    schemaVersion: 'ObservationJob@0.1.0', resultId: randomUUID(), observerId: slot.observer_id, observerKeyId,
    observerSequence: sequence.record.observer_sequence,
    unit: { experiment_id: unit.experimentId, experiment_version: unit.experimentVersion, phase: unit.phase, observer_id: unit.observerId, route_id: unit.routeId, transaction_class: unit.transactionClass, probe_index: unit.probeIndex, unit_id: unit.unitId },
    experimentDefinitionHash: hash, signature: submitted.signature, submission: submitted.submission,
    pollIntervalMs: 5_000, observationDeadlineMs: 120_000, readerRequestTimeoutMs: 10_000,
  };
  const entry = prepareRehearsalDispatch({ schedule, slotId, job, signer, issuedAt, expiresAt: new Date(timestamp(issuedAt) + 180_000).toISOString(), assignmentId });
  await journal.record('ASSIGNMENT_PREPARED', { entry }, canonicalNow(now));
  return { status: 'ASSIGNMENT_PREPARED', slot_id: slotId, entry, journal };
}

function sanitizedPrepared(value) {
  if (typeof value?.signature !== 'string' || typeof value?.wireTransactionBase64 !== 'string') throw Error('Prepared transaction is invalid');
  const { endpoint: _endpoint, ...safe } = value;
  return safe;
}
function timestamp(value) { const parsed = Date.parse(value); if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw Error('Canonical UTC required'); return parsed; }
function canonicalNow(now) { const value = now(); if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw Error('Invalid M2 runner clock'); return value.toISOString(); }
function errorClass(error) { return error instanceof Error && /^[A-Za-z][A-Za-z0-9]*$/u.test(error.name) ? error.name : 'UnknownError'; }

