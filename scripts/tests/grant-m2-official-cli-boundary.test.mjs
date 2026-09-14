import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("official slot CLI is quota-bound and cannot use rehearsal authorization", async () => {
  const source = await readFile("scripts/run-grant-m2-official-slot.mjs", "utf8");
  assert.match(source, /validateGrantM2OfficialRun\(run, quota\)/u);
  assert.match(source, /COORDINATOR_QUOTA_LIMIT = 100_000/u);
  assert.match(source, /createGrantM2OfficialSlotJournal/u);
  assert.match(source, /maxRetries: 0|submitPreparedM2RehearsalProbe/u);
  assert.doesNotMatch(source, /validateGrantM2LiveRun|PRE_M2_REHEARSAL_ONLY/u);
});

test("official completion CLI requires semantic reconciliation before journal accounting", async () => {
  const source = await readFile("scripts/complete-grant-m2-official-slot.mjs", "utf8");
  const reconcile = source.indexOf("reconcileGrantM2OfficialSlot({");
  const persist = source.indexOf("persistGrantM2OfficialSlotEvidence({");
  const append = source.indexOf("appendGrantM2OfficialEvent({");
  assert.ok(reconcile >= 0 && persist > reconcile && append > persist);
  assert.match(source, /selectGrantM2OfficialDeliveryReceipt/u);
});

test("official start CLI can only create the frozen journal start event", async () => {
  const source = await readFile("scripts/start-grant-m2-official-window.mjs", "utf8");
  assert.match(source, /initializeGrantM2OfficialJournal/u);
  assert.match(source, /appendGrantM2OfficialEvent/u);
  assert.match(source, /WINDOW_STARTED/u);
  assert.doesNotMatch(source, /sendTransaction|systemctl|ssh|scp/u);
});
