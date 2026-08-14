import { randomUUID } from "node:crypto";

import { generateKeyPairSigner } from "@solana/kit";
import { describe, expect, test } from "vitest";

import {
  IdempotentProbeResultIngestor,
  assertUniqueComparativeSignatures,
  buildSignedProbe,
  declareProbeUnits,
  deriveIdempotencyKey,
  executeRandomizedProbePlan,
  exportObserverPrivateKey,
  generateObserverKeyPair,
  importObserverPrivateKey,
  randomizeProbeUnits,
  sha256Hex,
  signProbeResult,
  validateMatchedPair,
  type ObserverAllowlistEntry,
  type ProbeDefinition,
  type SignedProbeResult,
  type UnsignedProbeResult,
} from "./index.js";

const definition: ProbeDefinition = {
  experimentId: "sprint-2-controlled",
  experimentVersion: "1",
  phase: "healthy",
  observerId: "observer-br",
  routeIds: ["route-a", "route-b", "route-c"],
  transactionClasses: ["MATCHED_CONTROL", "PROGRAM_X"],
  probeIndices: [0, 1],
  randomizationSeed: "sprint-2-reproducible-seed",
  pairingWindowMs: 5_000,
  programAddress: "11111111111111111111111111111111",
  computeUnitLimit: 20_000,
  computeUnitPriceMicroLamports: 0n,
  expectedComputeUnits: { MATCHED_CONTROL: 1_000, PROGRAM_X: 1_000 },
  feePayerPolicy: "one-funded-payer-per-observer-run",
  blockhashCommitment: "confirmed",
  preflightCommitment: "confirmed",
  skipPreflight: false,
  maxRetries: 0,
};

describe("Probe declarations and deterministic randomization", () => {
  test("declares every primary statistical unit exactly once", () => {
    const units = declareProbeUnits(definition);
    expect(units).toHaveLength(12);
    expect(new Set(units.map(unit => unit.unitId))).toHaveLength(12);
    expect(units.every(unit => unit.observerId === definition.observerId)).toBe(true);
  });

  test("produces a reproducible permutation and records realized order", () => {
    const units = declareProbeUnits(definition);
    const first = randomizeProbeUnits(units, definition.randomizationSeed);
    const second = randomizeProbeUnits(units, definition.randomizationSeed);
    const different = randomizeProbeUnits(units, "sprint-2-another-seed");
    expect(first).toEqual(second);
    expect(first.map(unit => unit.unitId)).not.toEqual(different.map(unit => unit.unitId));
    expect(first.map(unit => unit.executionOrdinal)).toEqual([...Array(12).keys()]);
    expect(new Set(first.map(unit => unit.unitId))).toHaveLength(12);
    for (const probeIndex of definition.probeIndices) {
      const ordinals = first.filter(unit => unit.probeIndex === probeIndex).map(unit => unit.executionOrdinal);
      expect(Math.max(...ordinals) - Math.min(...ordinals)).toBe(5);
    }
  });

  test("executes the realized order and reports pairing-window breaches", async () => {
    const units = declareProbeUnits({ ...definition, routeIds: ["route-a"], probeIndices: [0] });
    let elapsed = 0;
    const result = await executeRandomizedProbePlan(
      units,
      definition.randomizationSeed,
      5,
      async () => { elapsed += 10; },
      () => new Date(1_786_536_000_000 + elapsed),
    );
    expect(result.records.map(record => record.outcome)).toEqual(["COMPLETED", "COMPLETED"]);
    expect(result.pairingWindows).toEqual([expect.objectContaining({ probeIndex: 0, spanMs: 10, breached: true })]);
  });

  test("rejects definitions that omit a controlled class", () => {
    expect(() => declareProbeUnits({ ...definition, transactionClasses: ["MATCHED_CONTROL"] })).toThrow(/both|contain/i);
  });
});

describe("Unique structurally matched Solana transactions", () => {
  test("builds real signed legacy transactions with a one-byte class distinction", async () => {
    const feePayer = await generateKeyPairSigner();
    const units = declareProbeUnits({ ...definition, probeIndices: [0] });
    const context = {
      feePayer,
      lifetime: {
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 500n,
        contextSlot: 400n,
      },
    } as const;
    const probes = await Promise.all(units.map(unit => buildSignedProbe(definition, unit, context)));
    assertUniqueComparativeSignatures(probes);
    expect(new Set(probes.map(probe => probe.signature))).toHaveLength(6);
    expect(new Set(probes.map(probe => probe.wireTransactionBase64))).toHaveLength(6);

    for (const routeId of definition.routeIds) {
      const routePair = probes.filter(probe => probe.unit.routeId === routeId);
      expect(routePair).toHaveLength(2);
      expect(routePair[0]!.pairNonceHex).toBe(routePair[1]!.pairNonceHex);
      expect(routePair.map(probe => probe.discriminator).sort()).toEqual([0, 1]);
      expect(validateMatchedPair(routePair[0]!, routePair[1]!)).toMatchObject({ valid: true, reasons: [] });
    }
    expect(new Set(probes.filter(probe => probe.unit.transactionClass === "MATCHED_CONTROL").map(probe => probe.pairNonceHex))).toHaveLength(3);
  });

  test("excludes a structurally tampered pair before analysis", async () => {
    const feePayer = await generateKeyPairSigner();
    const units = declareProbeUnits({ ...definition, routeIds: ["route-a"], probeIndices: [0] });
    const context = { feePayer, lifetime: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1n, contextSlot: 1n } } as const;
    const [control, programX] = await Promise.all(units.map(unit => buildSignedProbe(definition, unit, context)));
    const tampered = {
      ...programX!,
      fingerprint: { ...programX!.fingerprint, computeUnitLimit: programX!.fingerprint.computeUnitLimit + 1 },
    };
    expect(validateMatchedPair(control!, tampered)).toMatchObject({ valid: false });
    expect(validateMatchedPair(control!, tampered).reasons).toContain("structural fingerprint differs");
  });
});

describe("Signed ProbeResult and idempotent allowlisted ingestion", () => {
  test("exports and reloads an Ed25519 observer key without changing its public identity", () => {
    const generated = generateObserverKeyPair("observer-br", "key-1");
    const document = exportObserverPrivateKey(generated);
    const loaded = importObserverPrivateKey(document);
    const signed = signProbeResult(makeUnsignedResult(), loaded);
    expect(loaded.publicKeySpkiBase64).toBe(generated.publicKeySpkiBase64);
    expect(new IdempotentProbeResultIngestor([allowlistFor(generated)]).ingest(signed, new Date("2026-08-12T12:00:01.000Z")))
      .toMatchObject({ status: "ACCEPTED" });
    expect(() => importObserverPrivateKey({ ...document, publicKeySpkiBase64: generateObserverKeyPair("other", "key").publicKeySpkiBase64 }))
      .toThrow(/mismatch/);
  });

  test("accepts once, treats an exact replay as a no-op, and rejects conflicting replay", () => {
    const keyPair = generateObserverKeyPair("observer-br", "key-1");
    const allowlist = allowlistFor(keyPair);
    const unsigned = makeUnsignedResult();
    const signed = signProbeResult(unsigned, keyPair);
    const collector = new IdempotentProbeResultIngestor([allowlist]);
    expect(collector.ingest(signed, new Date("2026-08-12T12:00:01.000Z"))).toEqual({ status: "ACCEPTED", storedCount: 1 });
    expect(collector.ingest(signed, new Date("2026-08-12T12:00:02.000Z"))).toEqual({ status: "DUPLICATE", storedCount: 1 });

    const conflict = signProbeResult({ ...unsigned, result_id: randomUUID(), terminal_state: "FINALIZED" }, keyPair);
    expect(collector.ingest(conflict, new Date("2026-08-12T12:00:03.000Z"))).toMatchObject({ status: "REJECTED", storedCount: 1 });
    expect(collector.acceptedResults()).toHaveLength(1);
  });

  test("rejects tampering, unknown keys, expired keys, and false quorum", () => {
    const keyPair = generateObserverKeyPair("observer-br", "key-1");
    const signed = signProbeResult(makeUnsignedResult(), keyPair);
    const active = allowlistFor(keyPair);

    const tampered = { ...signed, terminal_state: "FINALIZED" } as SignedProbeResult;
    expect(new IdempotentProbeResultIngestor([active]).ingest(tampered)).toMatchObject({ status: "REJECTED" });
    expect(new IdempotentProbeResultIngestor([]).ingest(signed)).toMatchObject({ status: "REJECTED", reason: "observer key is not allowlisted" });
    expect(new IdempotentProbeResultIngestor([{ ...active, validUntil: "2026-08-11T00:00:00.000Z" }]).ingest(signed)).toMatchObject({ status: "REJECTED" });
    expect(new IdempotentProbeResultIngestor([{ ...active, publicKeySpkiBase64: "not-a-key" }]).ingest(signed)).toMatchObject({ status: "REJECTED" });

    const falseQuorum = signProbeResult({
      ...makeUnsignedResult(),
      quorum_decisions: [{ ...makeUnsignedResult().quorum_decisions[0]!, supporting_claim_ids: [randomUUID()] }],
    }, keyPair);
    expect(new IdempotentProbeResultIngestor([active]).ingest(falseQuorum)).toMatchObject({ status: "REJECTED", reason: /fewer than two/ });
  });

  test("scopes observer sequence replay protection to an experiment definition", () => {
    const keyPair = generateObserverKeyPair("observer-br", "key-1");
    const firstUnsigned = makeUnsignedResult();
    const secondUnitId = sha256Hex(["sprint-2-controlled", "2", "healthy", "observer-br", "route-a", "MATCHED_CONTROL", "0"].join("\u001f"));
    const secondUnsigned = {
      ...makeUnsignedResult(),
      result_id: randomUUID(),
      idempotency_key: deriveIdempotencyKey("observer-br", secondUnitId),
      experiment_definition_hash: sha256Hex("second-experiment-definition"),
      unit: { ...makeUnsignedResult().unit, experiment_version: "2", unit_id: secondUnitId },
    };
    const collector = new IdempotentProbeResultIngestor([allowlistFor(keyPair)]);
    expect(collector.ingest(signProbeResult(firstUnsigned, keyPair), new Date("2026-08-12T12:00:01.000Z"))).toMatchObject({ status: "ACCEPTED" });
    expect(collector.ingest(signProbeResult(secondUnsigned, keyPair), new Date("2026-08-12T12:00:01.000Z"))).toMatchObject({ status: "ACCEPTED", storedCount: 2 });
  });
});

function allowlistFor(keyPair: ReturnType<typeof generateObserverKeyPair>): ObserverAllowlistEntry {
  return {
    observerId: keyPair.observerId,
    keyId: keyPair.keyId,
    publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-09-01T00:00:00.000Z",
  };
}

function makeUnsignedResult(): UnsignedProbeResult {
  const unitId = sha256Hex(["sprint-2-controlled", "1", "healthy", "observer-br", "route-a", "MATCHED_CONTROL", "0"].join("\u001f"));
  const firstClaimId = randomUUID();
  const secondClaimId = randomUUID();
  return {
    schema_version: "0.1.0",
    result_id: randomUUID(),
    idempotency_key: deriveIdempotencyKey("observer-br", unitId),
    observer_id: "observer-br",
    observer_key_id: "key-1",
    observer_sequence: 1,
    unit: {
      experiment_id: "sprint-2-controlled",
      experiment_version: "1",
      phase: "healthy",
      observer_id: "observer-br",
      route_id: "route-a",
      transaction_class: "MATCHED_CONTROL",
      probe_index: 0,
      unit_id: unitId,
    },
    experiment_definition_hash: sha256Hex("experiment-definition"),
    signature: "4".repeat(88),
    submission: {
      attempt_id: randomUUID(),
      attempt_number: 1,
      outcome: "RPC_ACKNOWLEDGED",
      blockhash: "11111111111111111111111111111111",
      blockhash_context_slot: 400,
      last_valid_block_height: 500,
      serialized_size_bytes: 240,
      created_at: "2026-08-12T12:00:00.000Z",
      submitted_at: "2026-08-12T12:00:00.100Z",
      response_at: "2026-08-12T12:00:00.200Z",
    },
    reader_claims: [
      { claim_id: firstClaimId, reader_id: "reader-1", observed_at: "2026-08-12T12:00:00.300Z", signature_status: "confirmed", transaction_slot: 401 },
      { claim_id: secondClaimId, reader_id: "reader-2", observed_at: "2026-08-12T12:00:00.310Z", signature_status: "confirmed", transaction_slot: 401 },
    ],
    quorum_decisions: [{
      decision_id: randomUUID(),
      decision_type: "CONFIRMED",
      supporting_claim_ids: [firstClaimId, secondClaimId],
      decided_at: "2026-08-12T12:00:00.320Z",
      quorum_rule_version: "ObservationQuorum@0.1.0",
    }],
    terminal_state: "CONFIRMED",
    observer_wall_time: "2026-08-12T12:00:00.400Z",
  };
}
