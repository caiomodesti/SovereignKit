import { describe, expect, test } from "vitest";
import { generateAssignmentAuthorityKeyPair } from "./observation-assignment.js";
import { signGrantM1ExperimentPlan, verifyGrantM1ExperimentPlan, type GrantM1ExperimentPlan } from "./grant-m1-experiment-plan.js";

describe("authenticated Grant M1 experiment plan", () => {
  test("signs a precommitted unit set and rejects later rewriting", () => {
    const key = generateAssignmentAuthorityKeyPair("grant-coordinator", "key-1");
    const plan: GrantM1ExperimentPlan = {
      schema_version: "GrantM1ExperimentPlan@0.1.0", plan_id: "20000000-0000-4000-8000-000000000000",
      issuer_id: key.issuerId, issuer_key_id: key.keyId, issued_at: "2026-09-06T00:00:00.000Z",
      experiment_definition_hash: "a".repeat(64),
      observers: ["a", "b", "c"].map(id => ({ observer_id: `observer-${id}`, expected_unit_ids: [id.repeat(64)] })),
    };
    const signed = signGrantM1ExperimentPlan(plan, key);
    const allowlist = { issuerId: key.issuerId, keyId: key.keyId, publicKeySpkiBase64: key.publicKeySpkiBase64, validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" };
    expect(() => verifyGrantM1ExperimentPlan(signed, allowlist)).not.toThrow();
    const rewritten = { ...signed, observers: signed.observers.map((entry, index) => index === 0 ? { ...entry, expected_unit_ids: ["f".repeat(64)] } : entry) };
    expect(() => verifyGrantM1ExperimentPlan(rewritten, allowlist)).toThrow(/payload hash/);
  });
});
