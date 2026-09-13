import { mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { verifyAssignmentReceipt } from './grant-m2-assignment-receipt.mjs';

const VERSION = 'GrantM2RehearsalSlotJournal@0.1.0';
const ORDER = ['TRANSACTION_PREPARED', 'SUBMISSION_ACKNOWLEDGED', 'ASSIGNMENT_PREPARED', 'TRANSPORT_RECEIPT_RECORDED', 'WORKER_COMPLETED'];
const HASH = /^[a-f0-9]{64}$/u;

async function writeOnce(path, value) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
}

export async function reserveM2RehearsalSlot({ directory, scheduleHash, slotId, unitId, observerId, reservedAt }) {
  if (![scheduleHash, slotId, unitId].every(value => typeof value === 'string' && HASH.test(value)) ||
      typeof observerId !== 'string' || observerId.length === 0 || new Date(reservedAt).toISOString() !== reservedAt) {
    throw Error('Invalid M2 slot reservation');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const slotDirectory = join(directory, slotId);
  try { await mkdir(slotDirectory, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === 'EEXIST') return { status: 'RECONCILIATION_REQUIRED', slot_id: slotId };
    throw error;
  }
  const reservation = { schema_version: VERSION, state: 'RESERVED', schedule_sha256: scheduleHash, slot_id: slotId, unit_id: unitId, observer_id: observerId, reserved_at: reservedAt };
  await writeOnce(join(slotDirectory, '00-reservation.json'), reservation);
  let position = -1;
  let uncertain = false;
  return {
    status: 'RESERVED', reservation,
    async record(state, evidence, recordedAt) {
      if (uncertain) throw Error('M2 slot requires reconciliation');
      const expected = ORDER[position + 1];
      if (state !== expected || new Date(recordedAt).toISOString() !== recordedAt || evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) {
        throw Error('Invalid M2 slot transition');
      }
      position += 1;
      const record = { schema_version: VERSION, state, slot_id: slotId, recorded_at: recordedAt, evidence };
      await writeOnce(join(slotDirectory, `${String(position + 1).padStart(2, '0')}-${state.toLowerCase().replaceAll('_', '-')}.json`), record);
      return structuredClone(record);
    },
    async markUncertain(stage, evidence, recordedAt) {
      if (uncertain || !ORDER.includes(stage) || new Date(recordedAt).toISOString() !== recordedAt || evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) {
        throw Error('Invalid M2 uncertain outcome');
      }
      uncertain = true;
      const record = { schema_version: VERSION, state: 'RECONCILIATION_REQUIRED', uncertain_stage: stage, slot_id: slotId, recorded_at: recordedAt, evidence };
      await writeOnce(join(slotDirectory, 'reconciliation-required.json'), record);
      return structuredClone(record);
    },
    async snapshot() {
      return JSON.parse(await readFile(join(slotDirectory, '00-reservation.json'), 'utf8'));
    },
  };
}

export async function completeM2RehearsalSlot({ directory, slotId, entry, receipt, receiptAuthority, transportRecordedAt, workerEvidence, workerRecordedAt }) {
  if (!HASH.test(slotId ?? '') || entry?.slot_id !== slotId || entry.assignment?.job?.observerId !== receiptAuthority?.observerId) throw Error('Invalid M2 slot completion request');
  for (const value of [transportRecordedAt, workerRecordedAt]) if (new Date(value).toISOString() !== value) throw Error('Invalid M2 slot completion timestamp');
  if (Date.parse(workerRecordedAt) < Date.parse(transportRecordedAt)) throw Error('M2 worker completion predates transport receipt');
  const slotDirectory = join(directory, slotId);
  const [reservation, transaction, acknowledgement, prepared] = await Promise.all([
    '00-reservation.json', '01-transaction-prepared.json', '02-submission-acknowledged.json', '03-assignment-prepared.json',
  ].map(async name => JSON.parse(await readFile(join(slotDirectory, name), 'utf8'))));
  if (reservation.state !== 'RESERVED' || reservation.slot_id !== slotId || reservation.observer_id !== entry.assignment.job.observerId || reservation.schedule_sha256 !== entry.schedule_sha256 ||
      transaction.state !== 'TRANSACTION_PREPARED' || transaction.slot_id !== slotId ||
      acknowledgement.state !== 'SUBMISSION_ACKNOWLEDGED' || acknowledgement.slot_id !== slotId || acknowledgement.evidence?.signature !== entry.assignment.job.signature ||
      prepared.state !== 'ASSIGNMENT_PREPARED' || prepared.slot_id !== slotId || JSON.stringify(prepared.evidence?.entry) !== JSON.stringify(entry)) {
    throw Error('M2 slot completion does not bind prepared evidence');
  }
  verifyAssignmentReceipt(receipt, entry, receiptAuthority, transportRecordedAt);
  if (workerEvidence?.event !== 'M2_OBSERVATION_JOB_COMPLETED' || workerEvidence.resultId !== entry.assignment.job.resultId ||
      !['FINALIZED', 'EXPIRED', 'OBSERVATION_INCONCLUSIVE'].includes(workerEvidence.terminalState) || workerEvidence.qualifyingUnits !== 0) {
    throw Error('M2 worker completion evidence is invalid');
  }
  try {
    await writeOnce(join(slotDirectory, '04-transport-receipt-recorded.json'), { schema_version: VERSION, state: 'TRANSPORT_RECEIPT_RECORDED', slot_id: slotId, recorded_at: transportRecordedAt, evidence: { receipt } });
    await writeOnce(join(slotDirectory, '05-worker-completed.json'), { schema_version: VERSION, state: 'WORKER_COMPLETED', slot_id: slotId, recorded_at: workerRecordedAt, evidence: workerEvidence });
  } catch (error) {
    if (error?.code === 'EEXIST') return { status: 'RECONCILIATION_REQUIRED', slot_id: slotId };
    throw error;
  }
  return { status: 'WORKER_COMPLETED', slot_id: slotId, terminal_state: workerEvidence.terminalState, qualifying_units: 0 };
}
