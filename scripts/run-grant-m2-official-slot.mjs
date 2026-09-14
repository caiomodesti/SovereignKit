import { mkdir, open, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import { importAssignmentAuthorityPrivateKey } from "../packages/collector/dist/observation-assignment.js";
import { prepareM2RehearsalProbe, submitPreparedM2RehearsalProbe } from "../packages/probes/dist/m2-rehearsal-submission.js";
import { createGrantM2OfficialSlotJournal } from "./lib/grant-m2-official-slot-journal.mjs";
import { prepareAndSubmitGrantM2OfficialSlot } from "./lib/grant-m2-official-slot-runner.mjs";
import { validateGrantM2OfficialRun } from "./lib/grant-m2-official-run.mjs";
import { openExclusiveObserverSequenceJournal } from "./lib/grant-m2-observer-sequence-journal.mjs";
import { createRpcBudget } from "./lib/grant-m2-rpc-budget.mjs";
import { openExclusiveRpcBudgetJournal } from "./lib/grant-m2-rpc-budget-journal.mjs";

const requireFromProbes = createRequire(new URL("../packages/probes/package.json", import.meta.url));
const { createKeyPairSignerFromBytes } = requireFromProbes("@solana/kit");
const COORDINATOR_QUOTA_LIMIT = 100_000;
const args = parseArgs(process.argv.slice(2));
const quota = await readJson(required("quota"));
const run = await readJson(required("run"));
validateGrantM2OfficialRun(run, quota);
const slotId = required("slot-id");
const slot = run.schedule.slots.find(item => item.slot_id === slotId);
if (slot === undefined) throw new Error("Unknown M2 official slot");
const observerKeys = await readJson(required("observer-keys"));
const observerKeyId = observerKeys[slot.observer_id];
if (typeof observerKeyId !== "string" || observerKeyId.length === 0) throw new Error("M2 official observer key ID is missing");
const feePayerBytes = await readJson(required("fee-payer"));
if (!Array.isArray(feePayerBytes) || feePayerBytes.length !== 64 || feePayerBytes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
  throw new Error("M2 official fee payer must be a 64-byte Solana keypair");
}
const feePayer = await createKeyPairSignerFromBytes(new Uint8Array(feePayerBytes));
const authority = importAssignmentAuthorityPrivateKey(await readJson(required("assignment-authority")));
const endpointPath = slot.route_id === "alchemy-solana-devnet" ? required("alchemy-endpoint-file") : required("public-endpoint-file");
const endpoint = (await readFile(resolve(endpointPath), "utf8")).trim();
const endpointUrl = new URL(endpoint);
if (endpointUrl.protocol !== "https:" || endpointUrl.username !== "" || endpointUrl.password !== "") throw new Error("M2 official endpoint must use credential-free HTTPS syntax");
const runDirectory = resolve(required("run-directory"));
await mkdir(runDirectory, { recursive: true, mode: 0o700 });
const sequenceJournal = await openExclusiveObserverSequenceJournal({
  directory: join(runDirectory, "sequences"), observerId: slot.observer_id,
  initialSequence: run.observer_initial_sequences[slot.observer_id],
});
const quotaJournal = await openExclusiveRpcBudgetJournal({ directory: join(runDirectory, "coordinator-quota"), owner: "coordinator", totalLimit: COORDINATOR_QUOTA_LIMIT });
const budget = createRpcBudget({ owner: "coordinator", totalLimit: COORDINATOR_QUOTA_LIMIT, restored: quotaJournal.restored, persist: quotaJournal.persist, now: Date.now });
const callRpc = async (method, operation) => {
  if (slot.route_id !== "alchemy-solana-devnet") return operation();
  const result = await budget.callWhenAvailable(method, operation);
  if (!result.allowed) throw new Error(`M2 official coordinator quota denied ${method}: ${result.reason}`);
  return result.value;
};
try {
  const result = await prepareAndSubmitGrantM2OfficialSlot({
    run, quota, slotId, observerKeyId, signer: authority, sequenceJournal,
    slotJournal: createGrantM2OfficialSlotJournal(join(runDirectory, "slot-side-effects")), nowAt: required("now-at"),
    prepareTransaction: unit => prepareM2RehearsalProbe({ endpoint, unit, feePayer, callRpc }),
    submitTransaction: prepared => submitPreparedM2RehearsalProbe(prepared, callRpc),
  });
  if (result.status !== "ASSIGNMENT_PREPARED" || budget.requiresReconciliation()) {
    await sequenceJournal.abandon(); await quotaJournal.abandon();
    process.stdout.write(`${JSON.stringify({ status: "RECONCILIATION_REQUIRED", slot_id: slotId, qualifying_units: 0 })}\n`);
    process.exitCode = 2;
  } else {
    const outputPath = resolve(required("output"));
    await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
    const output = await open(outputPath, "wx", 0o600);
    try { await output.writeFile(`${JSON.stringify(result.entry)}\n`, "utf8"); await output.sync(); }
    finally { await output.close(); }
    await sequenceJournal.close(); await quotaJournal.close();
    process.stdout.write(`${JSON.stringify({ status: "ASSIGNMENT_PREPARED", slot_id: slotId, observer_id: slot.observer_id, route_id: slot.route_id, signature: result.entry.assignment.job.signature, assignment_id: result.entry.assignment.assignmentId, qualifying_units: 0, output: outputPath })}\n`);
  }
} catch (error) {
  await sequenceJournal.abandon().catch(() => {}); await quotaJournal.abandon().catch(() => {});
  throw error;
}

function parseArgs(values) {
  if (values.length % 2 !== 0) throw new Error("Invalid arguments");
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--") || parsed.has(key.slice(2))) throw new Error("Invalid arguments");
    parsed.set(key.slice(2), value);
  }
  return parsed;
}
function required(name) { const value = args.get(name); if (typeof value !== "string" || value.length === 0) throw new Error(`--${name} is required`); return value; }
async function readJson(path) { return JSON.parse(await readFile(resolve(path), "utf8")); }
