import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { generateObserverKeyPair } from '../../packages/probes/dist/signing.js';
import { signAssignmentReceipt, verifyAssignmentReceipt } from '../lib/grant-m2-assignment-receipt.mjs';

function fixture() {
  const key = generateObserverKeyPair('observer-aws-a', 'observer-key');
  const entry = { assignment: { assignmentId: randomUUID(), payloadHash: 'a'.repeat(64), issuedAt: '2026-09-11T00:00:00.000Z', expiresAt: '2026-09-11T00:03:00.000Z', job: { observerId: key.observerId, observerKeyId: key.keyId } } };
  const authority = { observerId: key.observerId, keyId: key.keyId, publicKeySpkiBase64: key.publicKeySpkiBase64 };
  const receipt = signAssignmentReceipt({ entry, receivedAt: '2026-09-11T00:00:01.000Z' }, key);
  return { entry, authority, receipt };
}

test('signs and verifies an observer-bound assignment receipt', () => {
  const f = fixture();
  assert.doesNotThrow(() => verifyAssignmentReceipt(f.receipt, f.entry, f.authority, '2026-09-11T00:00:02.000Z'));
});

test('rejects tampering, wrong observer and future receipt time', () => {
  const f = fixture();
  assert.throws(() => verifyAssignmentReceipt({ ...f.receipt, payload_hash: 'b'.repeat(64) }, f.entry, f.authority, '2026-09-11T00:00:02.000Z'), /Mismatched/u);
  const other = generateObserverKeyPair('observer-google-e2-micro', 'observer-key');
  assert.throws(() => verifyAssignmentReceipt(f.receipt, f.entry, { observerId: other.observerId, keyId: other.keyId, publicKeySpkiBase64: other.publicKeySpkiBase64 }, '2026-09-11T00:00:02.000Z'), /Mismatched/u);
  assert.throws(() => verifyAssignmentReceipt(f.receipt, f.entry, f.authority, '2026-09-11T00:00:00.500Z'), /timestamp/u);
  const signature = `${f.receipt.observer_signature[0] === 'A' ? 'B' : 'A'}${f.receipt.observer_signature.slice(1)}`;
  assert.throws(() => verifyAssignmentReceipt({ ...f.receipt, observer_signature: signature }, f.entry, f.authority, '2026-09-11T00:00:02.000Z'), /signature/u);
});

