import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { generateAssignmentAuthorityKeyPair } from "../../packages/collector/dist/observation-assignment.js";
import { generateObserverKeyPair, signProbeResult } from "../../packages/probes/dist/signing.js";
import { createGrantM2OfficialRun, GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT } from "../lib/grant-m2-official-run.mjs";
import { GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 } from "../lib/grant-m2-official-schedule.mjs";
import { prepareAndSubmitGrantM2OfficialSlot } from "../lib/grant-m2-official-slot-runner.mjs";
import { reconcileGrantM2OfficialSlot } from "../lib/grant-m2-official-reconciliation.mjs";

const quota = JSON.parse(await readFile("deploy/grant-pilot/m2-resource-quota-estimate.json", "utf8"));
const schema = JSON.parse(await readFile("spec/probe-result.schema.json", "utf8"));
const run = createGrantM2OfficialRun({
  runId: "m2-official-reconciliation-test", startAt: "2026-09-14T04:10:00.000Z", authorizedAt: "2026-09-14T04:05:00.000Z",
  authorizationText: GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT, preflightCapturedAt: "2026-09-14T04:04:00.000Z",
  preflightSha256: "a".repeat(64), precommitmentSha256: GRANT_M2_FROZEN_PRECOMMITMENT_SHA256,
  sourceCommit: "b".repeat(40), quota,
  observerInitialSequences: { "observer-aws-a": 100, "observer-google-e2-micro": 200, "observer-oracle-a1": 300 },
});

async function fixture() {
  const authority = generateAssignmentAuthorityKeyPair("issuer", "assignment-key");
  const observer = generateObserverKeyPair(run.schedule.slots[0].observer_id, "observer-key");
  let entry;
  await prepareAndSubmitGrantM2OfficialSlot({
    run, quota, slotId: run.schedule.slots[0].slot_id, observerKeyId: observer.keyId, signer: authority,
    sequenceJournal: { reserve: async input => ({ status: "RESERVED", record: { ...input, observer_sequence: 7 } }) },
    slotJournal: { reserve: async () => ({ status: "RESERVED", record: async (_state, evidence) => { if (evidence.entry) entry = evidence.entry; }, markUncertain: async () => {} }) },
    prepareTransaction: async unit => ({ endpoint: "https://example.invalid", unitId: unit.unitId, signature: "1".repeat(88), wireTransactionBase64: "AQID", blockhash: "1".repeat(32), blockhashContextSlot: 10, lastValidBlockHeight: 200, serializedSizeBytes: 3, createdAt: run.schedule.start_at }),
    submitTransaction: async prepared => ({ signature: prepared.signature, submission: { attempt_id: "attempt-1", attempt_number: 1, outcome: "RPC_ACKNOWLEDGED", blockhash: prepared.blockhash, blockhash_context_slot: 10, last_valid_block_height: 200, serialized_size_bytes: 3, created_at: run.schedule.start_at, submitted_at: run.schedule.start_at, response_at: run.schedule.start_at } }),
    nowAt: run.schedule.start_at, now: () => new Date(run.schedule.start_at),
  });
  const observedAt = new Date(Date.parse(run.schedule.start_at) + 1_000).toISOString();
  const claims = ["grant-m2-reader-public-a", "grant-m2-reader-alchemy", "grant-m2-reader-public-b"].map((reader, index) => ({
    claim_id: `${entry.assignment.job.unit.unit_id}:poll-0:${reader}`, reader_id: reader, observed_at: observedAt,
    signature_status: "finalized", rpc_context_slot: 123, transaction_slot: 122, observed_block_height: 150,
  }));
  const unsigned = {
    schema_version: "0.1.0", result_id: entry.assignment.job.resultId,
    idempotency_key: (await import("../../packages/probes/dist/signing.js")).deriveIdempotencyKey(observer.observerId, entry.assignment.job.unit.unit_id),
    observer_id: observer.observerId, observer_key_id: observer.keyId, observer_sequence: 7,
    unit: entry.assignment.job.unit, experiment_definition_hash: entry.assignment.job.experimentDefinitionHash,
    signature: entry.assignment.job.signature, submission: entry.assignment.job.submission, reader_claims: claims,
    quorum_decisions: [{ decision_id: "decision-1", decision_type: "FINALIZED", supporting_claim_ids: claims.slice(0, 2).map(claim => claim.claim_id), decided_at: observedAt, quorum_rule_version: "ObservationQuorum@0.1.0" }],
    terminal_state: "FINALIZED", observer_wall_time: observedAt,
  };
  const signed = signProbeResult(unsigned, observer);
  const delivery = { delivery_sequence: 7, delivered_at: new Date(Date.parse(observedAt) + 1_000).toISOString(), result_id: signed.result_id, idempotency_key: signed.idempotency_key, payload_hash: signed.payload_hash, observer_signature: signed.observer_signature, collector_status: "ACCEPTED", collector_origin: "https://collector.sovereignkit.org" };
  const collectorRecord = { collector_sequence: 12, collected_at: new Date(Date.parse(observedAt) + 1_500).toISOString(), result: signed };
  return {
    entry, unsigned, signed, delivery, collectorRecord,
    completion: { event: "M2_OBSERVATION_JOB_COMPLETED", resultId: signed.result_id, terminalState: "FINALIZED", qualifyingUnits: 0 },
    rawText: `${JSON.stringify({ schema_version: "RawObservationPoll@0.2.0", assignment_id: entry.assignment.assignmentId, assignment_payload_hash: entry.assignment.payloadHash, poll_index: 0, observed_at: observedAt, observer_id: observer.observerId, signature: signed.signature, claims })}\n`,
    observerEntry: { observerId: observer.observerId, keyId: observer.keyId, publicKeySpkiBase64: observer.publicKeySpkiBase64, validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2026-10-01T00:00:00.000Z" },
    authorityEntry: { issuerId: authority.issuerId, keyId: authority.keyId, publicKeySpkiBase64: authority.publicKeySpkiBase64, validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2026-10-01T00:00:00.000Z" },
  };
}

function reconcile(value, changes = {}) {
  return reconcileGrantM2OfficialSlot({
    run, quota, slotId: run.schedule.slots[0].slot_id, entry: value.entry, completion: value.completion,
    unsignedResultText: `${JSON.stringify(value.unsigned)}\n`, rawText: value.rawText,
    deliveryReceiptText: `${JSON.stringify(value.delivery)}\n`, observerAllowlistEntry: value.observerEntry,
    collectorRecordText: `${JSON.stringify(value.collectorRecord)}\n`,
    assignmentAuthorityEntry: value.authorityEntry, probeResultSchema: schema,
    recordedAt: new Date(Date.parse(run.schedule.start_at) + 3_000).toISOString(), ...changes,
  });
}

test("qualifies an original Collector acceptance only after full semantic reconciliation", async () => {
  const value = await fixture();
  const result = reconcile(value);
  assert.equal(result.terminal_event.terminal_status, "QUALIFYING");
  assert.equal(result.terminal_event.qualifying_units, 1);
  assert.equal(result.terminal_event.observation_terminal_state, "FINALIZED");
  assert.equal(result.signed_result.payload_hash, value.signed.payload_hash);
});

test("rejects a Collector durable record that is absent or differs from the signed result", async () => {
  const value = await fixture();
  value.collectorRecord.result = { ...value.collectorRecord.result, terminal_state: "CONFIRMED" };
  assert.throws(() => reconcile(value), /Collector durable record/u);
});

test("rejects duplicate delivery, tampered signature and frozen unit drift", async () => {
  const duplicate = await fixture();
  duplicate.delivery.collector_status = "DUPLICATE";
  assert.throws(() => reconcile(duplicate), /original accepted delivery/u);

  const tampered = await fixture();
  tampered.delivery.observer_signature = `${tampered.delivery.observer_signature[0] === "A" ? "B" : "A"}${tampered.delivery.observer_signature.slice(1)}`;
  assert.throws(() => reconcile(tampered), /signature|payload hash/u);

  const drifted = await fixture();
  drifted.unsigned.unit = { ...drifted.unsigned.unit, route_id: "not-frozen" };
  assert.throws(() => reconcile(drifted), /schema validation|frozen statistical unit/u);
});

test("rejects raw provenance and terminal recomputation drift", async () => {
  const provenance = await fixture();
  provenance.rawText = provenance.rawText.replace(provenance.entry.assignment.assignmentId, "00000000-0000-4000-8000-000000000000");
  assert.throws(() => reconcile(provenance), /provenance/u);

  const terminal = await fixture();
  terminal.completion.terminalState = "CONFIRMED";
  assert.throws(() => reconcile(terminal), /completion|raw-to-derived/u);
});
