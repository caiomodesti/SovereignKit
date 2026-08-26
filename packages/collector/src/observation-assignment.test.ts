import { randomUUID } from "node:crypto";

import { deriveUnitId, sha256Hex } from "@sovereignkit/probes";
import { describe, expect, test } from "vitest";

import {
  generateAssignmentAuthorityKeyPair,
  signObservationAssignment,
  verifyObservationAssignment,
} from "./observation-assignment.js";
import type { ObservationJob } from "./observation-worker.js";

describe("signed observation assignment", () => {
  test("authenticates a bounded assignment and rejects tampering, expiry, and the wrong authority", () => {
    const key = generateAssignmentAuthorityKeyPair("grant-coordinator", "assignment-key-1");
    const signed = signObservationAssignment({
      schemaVersion: "ObservationAssignment@0.1.0",
      assignmentId: randomUUID(),
      issuerId: key.issuerId,
      issuerKeyId: key.keyId,
      issuedAt: "2026-08-25T11:59:00.000Z",
      expiresAt: "2026-08-25T13:00:00.000Z",
      job: makeJob(),
    }, key);
    const authority = { issuerId: key.issuerId, keyId: key.keyId, publicKeySpkiBase64: key.publicKeySpkiBase64, validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" };
    expect(() => verifyObservationAssignment(signed, authority, new Date("2026-08-25T12:00:00.000Z"))).not.toThrow();
    expect(() => verifyObservationAssignment({ ...signed, job: { ...signed.job, signature: "8".repeat(88) } }, authority, new Date("2026-08-25T12:00:00.000Z"))).toThrow(/payload hash/u);
    expect(() => verifyObservationAssignment(signed, authority, new Date("2026-08-25T13:00:00.001Z"))).toThrow(/not currently valid/u);
    const other = generateAssignmentAuthorityKeyPair("other-coordinator", "assignment-key-2");
    expect(() => verifyObservationAssignment(signed, { ...authority, issuerId: other.issuerId, keyId: other.keyId, publicKeySpkiBase64: other.publicKeySpkiBase64 }, new Date("2026-08-25T12:00:00.000Z"))).toThrow(/not allowlisted/u);
  });
});

function makeJob(): ObservationJob {
  const observerId = "observer-provider-a";
  const unitId = deriveUnitId({ experimentId: "grant-m1-assignment", experimentVersion: "1", phase: "healthy", observerId, routeId: "route-a", transactionClass: "MATCHED_CONTROL", probeIndex: 0 });
  return {
    schemaVersion: "ObservationJob@0.1.0",
    resultId: randomUUID(),
    observerId,
    observerKeyId: "key-1",
    observerSequence: 0,
    unit: { experiment_id: "grant-m1-assignment", experiment_version: "1", phase: "healthy", observer_id: observerId, route_id: "route-a", transaction_class: "MATCHED_CONTROL", probe_index: 0, unit_id: unitId },
    experimentDefinitionHash: sha256Hex("grant-m1-assignment-definition"),
    signature: "7".repeat(88),
    submission: { attempt_id: sha256Hex(`${unitId}:attempt-1`), attempt_number: 1, outcome: "RPC_ACKNOWLEDGED", blockhash: "11111111111111111111111111111111", blockhash_context_slot: 1, last_valid_block_height: 100, serialized_size_bytes: 240, created_at: "2026-08-25T11:58:00.000Z", submitted_at: "2026-08-25T11:58:01.000Z", response_at: "2026-08-25T11:58:02.000Z" },
    pollIntervalMs: 100,
    observationDeadlineMs: 1_000,
    readerRequestTimeoutMs: 100,
  };
}
