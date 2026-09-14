import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { persistGrantM2OfficialSlotEvidence, selectGrantM2OfficialDeliveryReceipt } from "../lib/grant-m2-official-evidence-store.mjs";

const slotId = "a".repeat(64);
const entry = { schema_version: "GrantM2PreparedDispatch@0.1.0", slot_id: slotId };
const completion = { resultId: "result-1" };
const unsigned = { result_id: "result-1", observer_id: "observer-a" };
const signed = { ...unsigned, payload_hash: "b".repeat(64), observer_signature: "signature" };
const delivery = { delivery_sequence: 1, result_id: "result-1", payload_hash: signed.payload_hash };
const raw = `${JSON.stringify({ poll_index: 0 })}\n`;

test("selects exactly one bound delivery record from an append-only observer log", () => {
  const other = { delivery_sequence: 0, result_id: "other" };
  const log = `${JSON.stringify(other)}\n${JSON.stringify(delivery)}\n`;
  assert.equal(selectGrantM2OfficialDeliveryReceipt(log, "result-1"), `${JSON.stringify(delivery)}\n`);
  assert.throws(() => selectGrantM2OfficialDeliveryReceipt(`${log}${JSON.stringify(delivery)}\n`, "result-1"), /ambiguous/u);
  assert.throws(() => selectGrantM2OfficialDeliveryReceipt(`${JSON.stringify(other)}\n`, "result-1"), /missing/u);
});

test("persists a complete immutable evidence set and permits exact crash recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grant-m2-official-evidence-"));
  const input = { directory, entry, completion, unsignedResultText: `${JSON.stringify(unsigned)}\n`, rawText: raw, signedResult: signed, deliveryReceiptText: `${JSON.stringify(delivery)}\n` };
  const first = await persistGrantM2OfficialSlotEvidence(input);
  const second = await persistGrantM2OfficialSlotEvidence(input);
  assert.deepEqual(second.manifest, first.manifest);
  const stored = JSON.parse(await readFile(join(first.slot_directory, "manifest.json"), "utf8"));
  assert.equal(Object.keys(stored.files).length, 6);
  assert.equal(stored.contains_private_key_material, false);
});

test("fails closed when immutable evidence changes after a partial or repeated run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grant-m2-official-evidence-"));
  const input = { directory, entry, completion, unsignedResultText: `${JSON.stringify(unsigned)}\n`, rawText: raw, signedResult: signed, deliveryReceiptText: `${JSON.stringify(delivery)}\n` };
  await persistGrantM2OfficialSlotEvidence(input);
  await assert.rejects(() => persistGrantM2OfficialSlotEvidence({ ...input, rawText: `${JSON.stringify({ poll_index: 1 })}\n` }), /conflicts/u);
});
