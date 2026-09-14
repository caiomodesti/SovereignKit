import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { appendGrantM2OfficialEvent, loadGrantM2OfficialJournal } from "./lib/grant-m2-official-journal.mjs";
import { persistGrantM2OfficialSlotEvidence, selectGrantM2OfficialCollectorRecord, selectGrantM2OfficialDeliveryReceipt } from "./lib/grant-m2-official-evidence-store.mjs";
import { reconcileGrantM2OfficialSlot } from "./lib/grant-m2-official-reconciliation.mjs";

const args = parseArgs(process.argv.slice(2));
const run = await readJson(required("run"));
const quota = await readJson(required("quota"));
const entry = await readJson(required("entry"));
const completion = await readJson(required("completion"));
const unsignedResultText = await readText(required("unsigned-result"));
const rawText = await readText(required("raw"));
const deliveryLogText = await readText(required("delivery-log"));
const collectorLogText = await readText(required("collector-log"));
const observerEntries = await readJson(required("observer-allowlist"));
const authorityEntries = await readJson(required("assignment-authorities"));
const probeResultSchema = await readJson(required("probe-result-schema"));
const slotId = required("slot-id");
const journalDirectory = resolve(required("journal-directory"));
const evidenceDirectory = resolve(required("evidence-directory"));
const recordedAt = required("recorded-at");

const state = await loadGrantM2OfficialJournal({ directory: journalDirectory, run, quota });
if (!state.started || state.ended) throw new Error("M2 official journal is not in an active window");
if (state.records.some(record => record.event === "SLOT_TERMINAL" && record.slot_id === slotId)) {
  throw new Error("M2 official slot already has a terminal journal event");
}
const job = entry?.assignment?.job;
const observerAllowlistEntry = selectIdentity(observerEntries, "observerId", job?.observerId, "keyId", job?.observerKeyId, "observer allowlist");
const assignmentAuthorityEntry = selectIdentity(authorityEntries, "issuerId", entry?.assignment?.issuerId, "keyId", entry?.assignment?.issuerKeyId, "assignment authority list");
const deliveryReceiptText = selectGrantM2OfficialDeliveryReceipt(deliveryLogText, job?.resultId);
const collectorRecordText = selectGrantM2OfficialCollectorRecord(collectorLogText, job?.resultId);
const reconciled = reconcileGrantM2OfficialSlot({
  run, quota, slotId, entry, completion, unsignedResultText, rawText, deliveryReceiptText, collectorRecordText,
  observerAllowlistEntry, assignmentAuthorityEntry, probeResultSchema, recordedAt,
});
const persisted = await persistGrantM2OfficialSlotEvidence({
  directory: evidenceDirectory, entry, completion, unsignedResultText, rawText,
  signedResult: reconciled.signed_result, deliveryReceiptText,
  collectorRecordText,
});
const finalState = await appendGrantM2OfficialEvent({ directory: journalDirectory, run, quota, event: reconciled.terminal_event });
process.stdout.write(`${JSON.stringify({
  status: "QUALIFYING", slot_id: slotId, result_id: reconciled.signed_result.result_id,
  observation_terminal_state: reconciled.signed_result.terminal_state,
  qualifying_units: 1, total_qualifying_units: finalState.counts.QUALIFYING,
  evidence_manifest_sha256: sha256(await readFile(resolve(persisted.slot_directory, "manifest.json"))),
})}\n`);

function parseArgs(values) {
  if (values.length % 2 !== 0) throw new Error("Invalid arguments");
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--") || parsed.has(key.slice(2))) throw new Error("Invalid arguments");
    parsed.set(key.slice(2), value);
  }
  return parsed;
}
function required(name) { const value = args.get(name); if (typeof value !== "string" || value.length === 0) throw new Error(`--${name} is required`); return value; }
async function readText(path) { return readFile(resolve(path), "utf8"); }
async function readJson(path) { return JSON.parse(await readText(path)); }
function selectIdentity(entries, firstKey, firstValue, secondKey, secondValue, label) {
  if (!Array.isArray(entries)) throw new Error(`${label} must be an array`);
  const matches = entries.filter(entry => entry?.[firstKey] === firstValue && entry?.[secondKey] === secondValue);
  if (matches.length !== 1) throw new Error(`${label} does not contain exactly one matching identity`);
  return matches[0];
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
