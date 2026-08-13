import { createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

import { canonicalJson, sha256Hex } from "./canonical.js";
import type { ObserverAllowlistEntry, SignedProbeResult, UnsignedProbeResult } from "./types.js";

export interface ObserverKeyPair {
  readonly observerId: string;
  readonly keyId: string;
  readonly privateKey: KeyObject;
  readonly publicKeySpkiBase64: string;
}

export function generateObserverKeyPair(observerId: string, keyId: string): ObserverKeyPair {
  if (observerId.length === 0 || keyId.length === 0) throw new Error("observerId and keyId are required");
  const pair = generateKeyPairSync("ed25519");
  return {
    observerId,
    keyId,
    privateKey: pair.privateKey,
    publicKeySpkiBase64: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

export function deriveIdempotencyKey(observerId: string, unitId: string): string {
  return sha256Hex(`${observerId}\u001f${unitId}`);
}

export function signProbeResult(unsigned: UnsignedProbeResult, keyPair: ObserverKeyPair): SignedProbeResult {
  if (unsigned.observer_id !== keyPair.observerId || unsigned.observer_key_id !== keyPair.keyId) {
    throw new Error("ProbeResult observer identity does not match signing key");
  }
  if (unsigned.unit.observer_id !== unsigned.observer_id) throw new Error("unit observer_id does not match result observer_id");
  const payloadHash = sha256Hex(canonicalJson(unsigned));
  const signable = canonicalJson({ ...unsigned, payload_hash: payloadHash });
  const observerSignature = sign(null, Buffer.from(signable), keyPair.privateKey).toString("base64url");
  return { ...unsigned, payload_hash: payloadHash, observer_signature: observerSignature };
}

export function verifyProbeResult(result: SignedProbeResult, entry: ObserverAllowlistEntry): boolean {
  if (result.observer_id !== entry.observerId || result.observer_key_id !== entry.keyId) return false;
  const { payload_hash: payloadHash, observer_signature: observerSignature, ...unsigned } = result;
  if (sha256Hex(canonicalJson(unsigned)) !== payloadHash) return false;
  const signable = canonicalJson({ ...unsigned, payload_hash: payloadHash });
  const publicKey = createPublicKey({ key: Buffer.from(entry.publicKeySpkiBase64, "base64"), type: "spki", format: "der" });
  return verify(null, Buffer.from(signable), publicKey, Buffer.from(observerSignature, "base64url"));
}
