import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

import { canonicalJson, sha256Hex } from "@sovereignkit/probes";

import type { ObservationJob } from "./observation-worker.js";

export const OBSERVATION_ASSIGNMENT_VERSION = "ObservationAssignment@0.1.0" as const;

export interface AssignmentAuthorityKeyPair {
  readonly issuerId: string;
  readonly keyId: string;
  readonly privateKey: KeyObject;
  readonly publicKeySpkiBase64: string;
}

export interface AssignmentAuthorityPrivateKeyDocument {
  readonly schemaVersion: "AssignmentAuthorityPrivateKey@0.1.0";
  readonly issuerId: string;
  readonly keyId: string;
  readonly privateKeyPkcs8Base64: string;
  readonly publicKeySpkiBase64: string;
}

export interface AssignmentAuthorityAllowlistEntry {
  readonly issuerId: string;
  readonly keyId: string;
  readonly publicKeySpkiBase64: string;
  readonly validFrom: string;
  readonly validUntil?: string;
}

export interface ObservationAssignment {
  readonly schemaVersion: typeof OBSERVATION_ASSIGNMENT_VERSION;
  readonly assignmentId: string;
  readonly issuerId: string;
  readonly issuerKeyId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly job: ObservationJob;
}

export interface SignedObservationAssignment extends ObservationAssignment {
  readonly payloadHash: string;
  readonly issuerSignature: string;
}

export function generateAssignmentAuthorityKeyPair(issuerId: string, keyId: string): AssignmentAuthorityKeyPair {
  if (!isIdentifier(issuerId) || !isIdentifier(keyId)) throw new Error("assignment authority issuerId and keyId are invalid");
  const pair = generateKeyPairSync("ed25519");
  return {
    issuerId,
    keyId,
    privateKey: pair.privateKey,
    publicKeySpkiBase64: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

export function exportAssignmentAuthorityPrivateKey(keyPair: AssignmentAuthorityKeyPair): AssignmentAuthorityPrivateKeyDocument {
  return {
    schemaVersion: "AssignmentAuthorityPrivateKey@0.1.0",
    issuerId: keyPair.issuerId,
    keyId: keyPair.keyId,
    privateKeyPkcs8Base64: keyPair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
  };
}

export function importAssignmentAuthorityPrivateKey(document: AssignmentAuthorityPrivateKeyDocument): AssignmentAuthorityKeyPair {
  if (document.schemaVersion !== "AssignmentAuthorityPrivateKey@0.1.0" || !isIdentifier(document.issuerId) || !isIdentifier(document.keyId)) {
    throw new Error("invalid assignment authority private key document");
  }
  const privateKey = createPrivateKey({ key: Buffer.from(document.privateKeyPkcs8Base64, "base64"), type: "pkcs8", format: "der" });
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("assignment authority private key must be Ed25519");
  const publicKeySpkiBase64 = createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64");
  if (publicKeySpkiBase64 !== document.publicKeySpkiBase64) throw new Error("assignment authority private/public key mismatch");
  return { issuerId: document.issuerId, keyId: document.keyId, privateKey, publicKeySpkiBase64 };
}

export function signObservationAssignment(assignment: ObservationAssignment, keyPair: AssignmentAuthorityKeyPair): SignedObservationAssignment {
  validateAssignmentStructure(assignment);
  if (assignment.issuerId !== keyPair.issuerId || assignment.issuerKeyId !== keyPair.keyId) throw new Error("assignment issuer does not match signing key");
  const payloadHash = sha256Hex(canonicalJson(assignment));
  const issuerSignature = sign(null, Buffer.from(canonicalJson({ ...assignment, payloadHash })), keyPair.privateKey).toString("base64url");
  return { ...assignment, payloadHash, issuerSignature };
}

export function verifyObservationAssignment(
  assignment: SignedObservationAssignment,
  authority: AssignmentAuthorityAllowlistEntry,
  now = new Date(),
): void {
  const { payloadHash, issuerSignature, ...unsigned } = assignment;
  validateAssignmentStructure(unsigned);
  if (assignment.issuerId !== authority.issuerId || assignment.issuerKeyId !== authority.keyId) throw new Error("assignment authority is not allowlisted");
  if (sha256Hex(canonicalJson(unsigned)) !== payloadHash) throw new Error("assignment payload hash is invalid");
  const validFrom = Date.parse(authority.validFrom);
  const validUntil = authority.validUntil === undefined ? Number.POSITIVE_INFINITY : Date.parse(authority.validUntil);
  const issuedAt = Date.parse(assignment.issuedAt);
  const expiresAt = Date.parse(assignment.expiresAt);
  const current = now.getTime();
  if (!Number.isFinite(validFrom) || Number.isNaN(validUntil) || validUntil <= validFrom) throw new Error("assignment authority validity interval is invalid");
  if (issuedAt < validFrom || issuedAt > validUntil) throw new Error("assignment was issued outside authority validity");
  if (current < issuedAt || current > expiresAt) throw new Error("assignment is not currently valid");
  let publicKey: KeyObject;
  try { publicKey = createPublicKey({ key: Buffer.from(authority.publicKeySpkiBase64, "base64"), type: "spki", format: "der" }); }
  catch { throw new Error("assignment authority public key encoding is invalid"); }
  const signable = canonicalJson({ ...unsigned, payloadHash });
  if (!verify(null, Buffer.from(signable), publicKey, Buffer.from(issuerSignature, "base64url"))) throw new Error("assignment signature is invalid");
}

function validateAssignmentStructure(assignment: ObservationAssignment): void {
  if (assignment.schemaVersion !== OBSERVATION_ASSIGNMENT_VERSION) throw new Error("unsupported observation assignment version");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(assignment.assignmentId)) throw new Error("assignmentId must be a UUID");
  if (!isIdentifier(assignment.issuerId) || !isIdentifier(assignment.issuerKeyId)) throw new Error("assignment issuer identity is invalid");
  const issuedAt = Date.parse(assignment.issuedAt);
  const expiresAt = Date.parse(assignment.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt || expiresAt - issuedAt > 86_400_000) {
    throw new Error("assignment validity window must be positive and no longer than 24 hours");
  }
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,160}$/u.test(value);
}
