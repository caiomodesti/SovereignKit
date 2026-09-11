import { createPublicKey, sign, verify } from 'node:crypto';
import { canonicalJson } from '../../packages/probes/dist/canonical.js';
import { sha256Hex } from '../../packages/probes/dist/canonical.js';

const VERSION = 'GrantM2AssignmentReceipt@0.1.0';

export function signAssignmentReceipt({ entry, receivedAt }, keyPair) {
  if (entry?.assignment?.job?.observerId !== keyPair?.observerId || entry.assignment.job.observerKeyId !== keyPair.keyId) {
    throw Error('Receipt observer identity does not match assignment');
  }
  const received = Date.parse(receivedAt);
  if (!Number.isFinite(received) || new Date(received).toISOString() !== receivedAt ||
      received < Date.parse(entry.assignment.issuedAt) || received > Date.parse(entry.assignment.expiresAt)) {
    throw Error('Receipt timestamp is outside assignment validity');
  }
  const unsigned = {
    schema_version: VERSION,
    status: 'RECEIVED',
    assignment_id: entry.assignment.assignmentId,
    payload_hash: entry.assignment.payloadHash,
    observer_id: keyPair.observerId,
    observer_key_id: keyPair.keyId,
    received_at: receivedAt,
  };
  const receiptHash = sha256Hex(canonicalJson(unsigned));
  const observerSignature = sign(null, Buffer.from(canonicalJson({ ...unsigned, receipt_hash: receiptHash })), keyPair.privateKey).toString('base64url');
  return { ...unsigned, receipt_hash: receiptHash, observer_signature: observerSignature };
}

export function verifyAssignmentReceipt(receipt, entry, authority, nowAt) {
  if (receipt?.schema_version !== VERSION || receipt.status !== 'RECEIVED' ||
      receipt.assignment_id !== entry.assignment.assignmentId || receipt.payload_hash !== entry.assignment.payloadHash ||
      receipt.observer_id !== entry.assignment.job.observerId || receipt.observer_key_id !== entry.assignment.job.observerKeyId ||
      receipt.observer_id !== authority?.observerId || receipt.observer_key_id !== authority?.keyId) {
    throw Error('Mismatched receipt');
  }
  const received = Date.parse(receipt.received_at);
  const now = Date.parse(nowAt);
  if (!Number.isFinite(received) || !Number.isFinite(now) || new Date(received).toISOString() !== receipt.received_at || received > now ||
      received < Date.parse(entry.assignment.issuedAt) || received > Date.parse(entry.assignment.expiresAt)) {
    throw Error('Receipt timestamp is invalid');
  }
  const { receipt_hash: receiptHash, observer_signature: observerSignature, ...unsigned } = receipt;
  if (sha256Hex(canonicalJson(unsigned)) !== receiptHash) throw Error('Receipt hash is invalid');
  let publicKey;
  try { publicKey = createPublicKey({ key: Buffer.from(authority.publicKeySpkiBase64, 'base64'), type: 'spki', format: 'der' }); }
  catch { throw Error('Receipt public key is invalid'); }
  if (publicKey.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(canonicalJson({ ...unsigned, receipt_hash: receiptHash })), publicKey, Buffer.from(observerSignature, 'base64url'))) {
    throw Error('Receipt signature is invalid');
  }
}
