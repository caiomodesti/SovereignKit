import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { generateAssignmentAuthorityKeyPair } from "../../packages/collector/dist/observation-assignment.js";
import { GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 } from "../lib/grant-m2-official-schedule.mjs";
import { createGrantM2OfficialRun, GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT } from "../lib/grant-m2-official-run.mjs";
import { createGrantM2OfficialSlotJournal } from "../lib/grant-m2-official-slot-journal.mjs";
import { prepareAndSubmitGrantM2OfficialSlot } from "../lib/grant-m2-official-slot-runner.mjs";

const quota = JSON.parse(await readFile("deploy/grant-pilot/m2-resource-quota-estimate.json", "utf8"));
const run = createGrantM2OfficialRun({
  runId: "m2-official-slot-test", startAt: "2026-09-14T04:10:00.000Z", authorizedAt: "2026-09-14T04:05:00.000Z",
  authorizationText: GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT, preflightCapturedAt: "2026-09-14T04:04:00.000Z",
  preflightSha256: "a".repeat(64), precommitmentSha256: GRANT_M2_FROZEN_PRECOMMITMENT_SHA256,
  sourceCommit: "b".repeat(40), quota,
  observerInitialSequences: { "observer-aws-a": 100, "observer-google-e2-micro": 200, "observer-oracle-a1": 300 },
});

function sequenceJournal() {
  let used = false;
  return { reserve: async input => {
    if (used) return { status: "RECONCILIATION_REQUIRED" };
    used = true;
    return { status: "RESERVED", record: { ...input, observer_sequence: 42 } };
  } };
}
function transaction(unit) {
  return {
    endpoint: "https://example.invalid", unitId: unit.unitId, signature: "1".repeat(88), wireTransactionBase64: "AQID",
    blockhash: "1".repeat(32), blockhashContextSlot: 1, lastValidBlockHeight: 2, serializedSizeBytes: 3,
    createdAt: run.schedule.start_at,
  };
}
function submission(prepared) {
  return {
    signature: prepared.signature,
    submission: {
      attempt_id: createHash("sha256").update(`${prepared.unitId}:attempt-1`).digest("hex"),
      attempt_number: 1, outcome: "RPC_ACKNOWLEDGED", blockhash: prepared.blockhash,
      blockhash_context_slot: 1, last_valid_block_height: 2, serialized_size_bytes: 3,
      created_at: run.schedule.start_at, submitted_at: run.schedule.start_at, response_at: run.schedule.start_at,
    },
  };
}

test("prepares one official assignment bound to the frozen experiment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grant-m2-official-slot-"));
  const signer = generateAssignmentAuthorityKeyPair("issuer", "key");
  const result = await prepareAndSubmitGrantM2OfficialSlot({
    run, quota, slotId: run.schedule.slots[0].slot_id, observerKeyId: "observer-key", signer,
    sequenceJournal: sequenceJournal(), slotJournal: createGrantM2OfficialSlotJournal(directory),
    prepareTransaction: async unit => transaction(unit), submitTransaction: async prepared => submission(prepared),
    nowAt: run.schedule.start_at, now: () => new Date(run.schedule.start_at),
  });
  assert.equal(result.status, "ASSIGNMENT_PREPARED");
  assert.equal(result.entry.execution_scope, "M2_OFFICIAL_FOURTEEN_DAY_WINDOW");
  assert.equal(result.entry.assignment.job.unit.experiment_id, "sovereignkit-grant-m2-public-pilot");
  assert.equal(result.entry.assignment.job.experimentDefinitionHash, GRANT_M2_FROZEN_PRECOMMITMENT_SHA256);
  assert.equal(result.entry.assignment.job.observerSequence, 42);
});

test("fails closed after ambiguous submission and never prepares an assignment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grant-m2-official-slot-"));
  const signer = generateAssignmentAuthorityKeyPair("issuer", "key");
  const result = await prepareAndSubmitGrantM2OfficialSlot({
    run, quota, slotId: run.schedule.slots[0].slot_id, observerKeyId: "observer-key", signer,
    sequenceJournal: sequenceJournal(), slotJournal: createGrantM2OfficialSlotJournal(directory),
    prepareTransaction: async unit => transaction(unit), submitTransaction: async () => { throw new Error("timeout"); },
    nowAt: run.schedule.start_at, now: () => new Date(run.schedule.start_at),
  });
  assert.equal(result.status, "RECONCILIATION_REQUIRED");
  const retry = await prepareAndSubmitGrantM2OfficialSlot({
    run, quota, slotId: run.schedule.slots[0].slot_id, observerKeyId: "observer-key", signer,
    sequenceJournal: sequenceJournal(), slotJournal: createGrantM2OfficialSlotJournal(directory),
    prepareTransaction: async unit => transaction(unit), submitTransaction: async prepared => submission(prepared),
    nowAt: run.schedule.start_at, now: () => new Date(run.schedule.start_at),
  });
  assert.equal(retry.status, "RECONCILIATION_REQUIRED");
});

test("rejects execution before or after the frozen tolerance", async () => {
  const signer = generateAssignmentAuthorityKeyPair("issuer", "key");
  for (const nowAt of [
    new Date(Date.parse(run.schedule.start_at) - 1).toISOString(),
    new Date(Date.parse(run.schedule.start_at) + 120_001).toISOString(),
  ]) {
    const directory = await mkdtemp(join(tmpdir(), "grant-m2-official-slot-"));
    await assert.rejects(() => prepareAndSubmitGrantM2OfficialSlot({
      run, quota, slotId: run.schedule.slots[0].slot_id, observerKeyId: "observer-key", signer,
      sequenceJournal: sequenceJournal(), slotJournal: createGrantM2OfficialSlotJournal(directory),
      prepareTransaction: async unit => transaction(unit), submitTransaction: async prepared => submission(prepared),
      nowAt, now: () => new Date(nowAt),
    }), /outside/u);
  }
});
