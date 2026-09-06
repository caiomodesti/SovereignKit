import { createPublicKey, sign, verify } from "node:crypto";
import { canonicalJson, sha256Hex } from "@sovereignkit/probes";
import type { AssignmentAuthorityAllowlistEntry, AssignmentAuthorityKeyPair } from "./observation-assignment.js";

export const GRANT_M1_EXPERIMENT_PLAN_VERSION = "GrantM1ExperimentPlan@0.1.0" as const;

export interface GrantM1ExperimentPlan {
  readonly schema_version: typeof GRANT_M1_EXPERIMENT_PLAN_VERSION;
  readonly plan_id: string;
  readonly issuer_id: string;
  readonly issuer_key_id: string;
  readonly issued_at: string;
  readonly experiment_definition_hash: string;
  readonly observers: readonly { readonly observer_id: string; readonly expected_unit_ids: readonly string[] }[];
}
export interface SignedGrantM1ExperimentPlan extends GrantM1ExperimentPlan {
  readonly payload_hash: string;
  readonly issuer_signature: string;
}

export function signGrantM1ExperimentPlan(plan: GrantM1ExperimentPlan, authority: AssignmentAuthorityKeyPair): SignedGrantM1ExperimentPlan {
  validatePlan(plan);
  if (plan.issuer_id !== authority.issuerId || plan.issuer_key_id !== authority.keyId) throw new Error("experiment plan issuer does not match signing key");
  const payload_hash = sha256Hex(canonicalJson(plan));
  const issuer_signature = sign(null, Buffer.from(canonicalJson({ ...plan, payload_hash })), authority.privateKey).toString("base64url");
  return { ...plan, payload_hash, issuer_signature };
}

export function verifyGrantM1ExperimentPlan(plan: SignedGrantM1ExperimentPlan, authority: AssignmentAuthorityAllowlistEntry): void {
  const { payload_hash, issuer_signature, ...unsigned } = plan;
  validatePlan(unsigned);
  if (!/^[a-f0-9]{64}$/u.test(payload_hash) || typeof issuer_signature !== "string" || !/^[A-Za-z0-9_-]{80,100}$/u.test(issuer_signature)) throw new Error("experiment plan authentication fields are invalid");
  if (plan.issuer_id !== authority.issuerId || plan.issuer_key_id !== authority.keyId) throw new Error("experiment plan authority is not allowlisted");
  const issuedAt = Date.parse(plan.issued_at);
  const validFrom = Date.parse(authority.validFrom);
  const validUntil = authority.validUntil === undefined ? Number.POSITIVE_INFINITY : Date.parse(authority.validUntil);
  if (!Number.isFinite(validFrom) || Number.isNaN(validUntil) || validUntil <= validFrom || issuedAt < validFrom || issuedAt > validUntil) throw new Error("experiment plan issuance is outside authority validity");
  if (sha256Hex(canonicalJson(unsigned)) !== payload_hash) throw new Error("experiment plan payload hash is invalid");
  let publicKey;
  try { publicKey = createPublicKey({ key: Buffer.from(authority.publicKeySpkiBase64, "base64"), type: "spki", format: "der" }); }
  catch { throw new Error("experiment plan authority public key is invalid"); }
  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("experiment plan authority must use Ed25519");
  if (!verify(null, Buffer.from(canonicalJson({ ...unsigned, payload_hash })), publicKey, Buffer.from(issuer_signature, "base64url"))) throw new Error("experiment plan signature is invalid");
}

function validatePlan(plan: GrantM1ExperimentPlan): void {
  if (plan.schema_version !== GRANT_M1_EXPERIMENT_PLAN_VERSION || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(plan.plan_id) ||
      !identifier(plan.issuer_id) || !identifier(plan.issuer_key_id) || !Number.isFinite(Date.parse(plan.issued_at)) ||
      !/^[a-f0-9]{64}$/u.test(plan.experiment_definition_hash) || !Array.isArray(plan.observers) || plan.observers.length < 3) throw new Error("experiment plan structure is invalid");
  if (new Set(plan.observers.map(entry => entry.observer_id)).size !== plan.observers.length) throw new Error("experiment plan observer IDs must be unique");
  for (const entry of plan.observers) if (!identifier(entry.observer_id) || !Array.isArray(entry.expected_unit_ids) || entry.expected_unit_ids.length === 0 ||
    new Set(entry.expected_unit_ids).size !== entry.expected_unit_ids.length || entry.expected_unit_ids.some((id: unknown) => typeof id !== "string" || !/^[a-f0-9]{64}$/u.test(id))) throw new Error("experiment plan units are invalid");
}

function identifier(value: string): boolean { return /^[A-Za-z0-9._:-]{1,160}$/u.test(value); }
