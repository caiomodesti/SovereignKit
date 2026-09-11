import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { generateAssignmentAuthorityKeyPair, signObservationAssignment } from '../../packages/collector/dist/observation-assignment.js';
import { generateObserverKeyPair } from '../../packages/probes/dist/signing.js';
import { receiveAssignmentWriteOnce } from '../lib/grant-m2-assignment-inbox.mjs';
import { verifyAssignmentReceipt } from '../lib/grant-m2-assignment-receipt.mjs';

function fixture() {
  const issuedAt = '2026-09-11T00:00:00.000Z';
  const observerKey = generateObserverKeyPair('observer-aws-a', 'observer-key');
  const signer = generateAssignmentAuthorityKeyPair('coordinator', 'assignment-key');
  const assignment = signObservationAssignment({
    schemaVersion: 'ObservationAssignment@0.1.0', assignmentId: randomUUID(), issuerId: signer.issuerId, issuerKeyId: signer.keyId,
    issuedAt, expiresAt: '2026-09-11T00:03:00.000Z',
    job: { observerId: observerKey.observerId, observerKeyId: observerKey.keyId },
  }, signer);
  const entry = { schema_version: 'GrantM2PreparedDispatch@0.1.0', schedule_sha256: 'a'.repeat(64), slot_id: 'b'.repeat(64), assignment };
  const assignmentAuthority = { issuerId: signer.issuerId, keyId: signer.keyId, publicKeySpkiBase64: signer.publicKeySpkiBase64, validFrom: issuedAt };
  const receiptAuthority = { observerId: observerKey.observerId, keyId: observerKey.keyId, publicKeySpkiBase64: observerKey.publicKeySpkiBase64 };
  return { entry, assignmentAuthority, observerKey, receiptAuthority, receivedAt: '2026-09-11T00:00:01.000Z' };
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'grant-m2-inbox-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('stores one assignment and a verifiable signed receipt', async t => {
  const directory = await temporaryDirectory(t);
  const f = fixture();
  const result = await receiveAssignmentWriteOnce({ directory, ...f });
  assert.equal(result.status, 'RECEIVED');
  verifyAssignmentReceipt(result.receipt, f.entry, f.receiptAuthority, f.receivedAt);
  const prepared = JSON.parse(await readFile(join(directory, f.entry.assignment.assignmentId, 'prepared-dispatch.json'), 'utf8'));
  const stored = JSON.parse(await readFile(join(directory, f.entry.assignment.assignmentId, 'assignment.json'), 'utf8'));
  const receipt = JSON.parse(await readFile(join(directory, f.entry.assignment.assignmentId, 'receipt.json'), 'utf8'));
  assert.deepEqual(prepared, f.entry);
  assert.deepEqual(stored, f.entry.assignment);
  assert.deepEqual(receipt, result.receipt);
});

test('concurrent and repeated delivery never overwrite the inbox', async t => {
  const directory = await temporaryDirectory(t);
  const f = fixture();
  const results = await Promise.all([1, 2].map(() => receiveAssignmentWriteOnce({ directory, ...f })));
  assert.equal(results.filter(result => result.status === 'RECEIVED').length, 1);
  assert.equal(results.filter(result => result.status === 'RECONCILIATION_REQUIRED').length, 1);
  assert.equal((await receiveAssignmentWriteOnce({ directory, ...f })).status, 'RECONCILIATION_REQUIRED');
});

test('rejects invalid authority or wrong observer before claiming an inbox directory', async t => {
  const directory = await temporaryDirectory(t);
  const f = fixture();
  const tampered = structuredClone(f.entry); tampered.assignment.issuerSignature = `x${tampered.assignment.issuerSignature.slice(1)}`;
  await assert.rejects(receiveAssignmentWriteOnce({ directory, ...f, entry: tampered }), /signature/u);
  const wrongKey = generateObserverKeyPair('observer-google-e2-micro', 'observer-key');
  await assert.rejects(receiveAssignmentWriteOnce({ directory, ...f, observerKey: wrongKey }), /does not target/u);
});
