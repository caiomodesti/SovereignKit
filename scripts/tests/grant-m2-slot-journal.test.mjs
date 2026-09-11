import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { completeM2RehearsalSlot, reserveM2RehearsalSlot } from '../lib/grant-m2-slot-journal.mjs';
import { generateObserverKeyPair } from '../../packages/probes/dist/signing.js';
import { generateAssignmentAuthorityKeyPair, signObservationAssignment } from '../../packages/collector/dist/observation-assignment.js';
import { signAssignmentReceipt } from '../lib/grant-m2-assignment-receipt.mjs';

const hash = digit => digit.repeat(64);
async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'grant-m2-slot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('persists the slot before side effects and enforces ordered evidence', async t => {
  const directory = await temporaryDirectory(t);
  const slot = await reserveM2RehearsalSlot({ directory, scheduleHash: hash('a'), slotId: hash('b'), unitId: hash('c'), observerId: 'observer-aws-a', reservedAt: '2026-09-11T12:00:00.000Z' });
  assert.equal(slot.status, 'RESERVED');
  await assert.rejects(slot.record('SUBMISSION_ACKNOWLEDGED', {}, '2026-09-11T12:00:00.001Z'), /transition/u);
  await slot.record('TRANSACTION_PREPARED', { signature: 'retained' }, '2026-09-11T12:00:00.001Z');
  await slot.record('SUBMISSION_ACKNOWLEDGED', { signature: 'retained' }, '2026-09-11T12:00:00.002Z');
  assert.deepEqual((await readdir(join(directory, hash('b')))).sort(), [
    '00-reservation.json', '01-transaction-prepared.json', '02-submission-acknowledged.json',
  ]);
  assert.equal((await reserveM2RehearsalSlot({ directory, scheduleHash: hash('a'), slotId: hash('b'), unitId: hash('c'), observerId: 'observer-aws-a', reservedAt: '2026-09-11T12:00:01.000Z' })).status, 'RECONCILIATION_REQUIRED');
});

test('records a signed transport receipt and bound worker completion exactly once', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'grant-m2-slot-complete-'));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const slotId = '1'.repeat(64); const observer = generateObserverKeyPair('observer-aws-a', 'observer-key');
  const authority = generateAssignmentAuthorityKeyPair('coordinator', 'authority-key');
  const assignment = signObservationAssignment({ schemaVersion: 'ObservationAssignment@0.1.0', assignmentId: '00000000-0000-4000-8000-000000000001', issuerId: authority.issuerId, issuerKeyId: authority.keyId, issuedAt: '2026-09-11T12:00:00.000Z', expiresAt: '2026-09-11T12:03:00.000Z', job: { observerId: observer.observerId, observerKeyId: observer.keyId, resultId: '00000000-0000-4000-8000-000000000002', signature: '2'.repeat(88) } }, authority);
  const entry = { schema_version: 'GrantM2PreparedDispatch@0.1.0', schedule_sha256: '2'.repeat(64), slot_id: slotId, assignment };
  const journal = await reserveM2RehearsalSlot({ directory, scheduleHash: entry.schedule_sha256, slotId, unitId: '3'.repeat(64), observerId: observer.observerId, reservedAt: assignment.issuedAt });
  await journal.record('TRANSACTION_PREPARED', {}, assignment.issuedAt); await journal.record('SUBMISSION_ACKNOWLEDGED', { signature: assignment.job.signature }, assignment.issuedAt); await journal.record('ASSIGNMENT_PREPARED', { entry }, assignment.issuedAt);
  const receipt = signAssignmentReceipt({ entry, receivedAt: '2026-09-11T12:00:01.000Z' }, observer);
  const receiptAuthority = { observerId: observer.observerId, keyId: observer.keyId, publicKeySpkiBase64: observer.publicKeySpkiBase64 };
  const workerEvidence = { event: 'M2_OBSERVATION_JOB_COMPLETED', resultId: assignment.job.resultId, terminalState: 'FINALIZED', qualifyingUnits: 0 };
  assert.deepEqual(await completeM2RehearsalSlot({ directory, slotId, entry, receipt, receiptAuthority, transportRecordedAt: '2026-09-11T12:00:02.000Z', workerEvidence, workerRecordedAt: '2026-09-11T12:00:03.000Z' }), { status: 'WORKER_COMPLETED', slot_id: slotId, terminal_state: 'FINALIZED', qualifying_units: 0 });
  assert.equal((await completeM2RehearsalSlot({ directory, slotId, entry, receipt, receiptAuthority, transportRecordedAt: '2026-09-11T12:00:02.000Z', workerEvidence, workerRecordedAt: '2026-09-11T12:00:03.000Z' })).status, 'RECONCILIATION_REQUIRED');
});

test('an uncertain side effect permanently closes automatic progress', async t => {
  const directory = await temporaryDirectory(t);
  const slot = await reserveM2RehearsalSlot({ directory, scheduleHash: hash('d'), slotId: hash('e'), unitId: hash('f'), observerId: 'observer-oracle-a1', reservedAt: '2026-09-11T12:00:00.000Z' });
  await slot.markUncertain('TRANSACTION_PREPARED', { reason: 'write result unknown' }, '2026-09-11T12:00:00.001Z');
  await assert.rejects(slot.record('TRANSACTION_PREPARED', {}, '2026-09-11T12:00:00.002Z'), /reconciliation/u);
});
