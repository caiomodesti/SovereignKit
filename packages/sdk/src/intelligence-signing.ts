import { createHash, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

import type { IntelligenceSnapshot } from "./intelligence.js";

export const SIGNED_INTELLIGENCE_ENVELOPE_VERSION = "SignedIntelligenceSnapshot@0.1.0" as const;

export interface IntelligencePublisherKeyPair {
  readonly publisherId: string;
  readonly keyId: string;
  readonly privateKey: KeyObject;
  readonly publicKeySpkiBase64: string;
}

export interface IntelligencePublisherAllowlistEntry {
  readonly publisherId: string;
  readonly keyId: string;
  readonly publicKeySpkiBase64: string;
  readonly validFrom: string;
  readonly validUntil?: string;
}

export interface SignedIntelligenceSnapshot {
  readonly envelope_version: typeof SIGNED_INTELLIGENCE_ENVELOPE_VERSION;
  readonly publisher_id: string;
  readonly publisher_key_id: string;
  readonly snapshot_hash: string;
  readonly publisher_signature: string;
  readonly snapshot: IntelligenceSnapshot;
}

export function generateIntelligencePublisherKeyPair(publisherId: string, keyId: string): IntelligencePublisherKeyPair {
  if (!validId(publisherId) || !validId(keyId)) throw new Error("publisherId and keyId must be non-empty bounded identifiers");
  const pair = generateKeyPairSync("ed25519");
  return {
    publisherId,
    keyId,
    privateKey: pair.privateKey,
    publicKeySpkiBase64: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

export function signIntelligenceSnapshot(snapshot: IntelligenceSnapshot, key: IntelligencePublisherKeyPair): SignedIntelligenceSnapshot {
  const snapshotHash = sha256Hex(canonicalJson(snapshot));
  return {
    envelope_version: SIGNED_INTELLIGENCE_ENVELOPE_VERSION,
    publisher_id: key.publisherId,
    publisher_key_id: key.keyId,
    snapshot_hash: snapshotHash,
    publisher_signature: sign(null, Buffer.from(snapshotHash, "hex"), key.privateKey).toString("base64"),
    snapshot,
  };
}

export function verifySignedIntelligenceSnapshot(value: unknown, publishers: readonly IntelligencePublisherAllowlistEntry[]): IntelligenceSnapshot {
  const allowedFields = new Set(["envelope_version", "publisher_id", "publisher_key_id", "snapshot_hash", "publisher_signature", "snapshot"]);
  if (!isRecord(value) || value.envelope_version !== SIGNED_INTELLIGENCE_ENVELOPE_VERSION ||
      Object.keys(value).some(field => !allowedFields.has(field)) ||
      !validId(value.publisher_id) || !validId(value.publisher_key_id) ||
      typeof value.snapshot_hash !== "string" || !/^[a-f0-9]{64}$/.test(value.snapshot_hash) ||
      typeof value.publisher_signature !== "string" || !isRecord(value.snapshot)) {
    throw new Error("signed intelligence envelope is invalid");
  }
  const matchingPublishers = publishers.filter(entry => entry.publisherId === value.publisher_id && entry.keyId === value.publisher_key_id);
  if (matchingPublishers.length !== 1) throw new Error(matchingPublishers.length === 0 ? "intelligence publisher is not allowlisted" : "intelligence publisher allowlist is ambiguous");
  const publisher = matchingPublishers[0]!;
  const snapshot = value.snapshot as unknown as IntelligenceSnapshot;
  const generatedAt = Date.parse(snapshot.generated_at);
  const expiresAt = Date.parse(snapshot.expires_at);
  const validFrom = Date.parse(publisher.validFrom);
  const validUntil = publisher.validUntil === undefined ? Number.POSITIVE_INFINITY : Date.parse(publisher.validUntil);
  if (![generatedAt, expiresAt, validFrom, validUntil].every(number => Number.isFinite(number) || number === Number.POSITIVE_INFINITY) ||
      generatedAt < validFrom || expiresAt > validUntil) throw new Error("snapshot is outside publisher key validity");
  const snapshotHash = sha256Hex(canonicalJson(snapshot));
  if (snapshotHash !== value.snapshot_hash) throw new Error("intelligence snapshot hash mismatch");
  let publicKey: KeyObject;
  try { publicKey = createPublicKey({ key: Buffer.from(publisher.publicKeySpkiBase64, "base64"), type: "spki", format: "der" }); }
  catch { throw new Error("intelligence publisher public key is invalid"); }
  if (publicKey.asymmetricKeyType !== "ed25519" || !verify(null, Buffer.from(snapshotHash, "hex"), publicKey, Buffer.from(value.publisher_signature, "base64"))) {
    throw new Error("intelligence publisher signature is invalid");
  }
  return snapshot;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 160;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON does not support non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("unsupported canonical JSON value");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
