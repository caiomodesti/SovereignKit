import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const evidencePath = resolve(required("evidence"));
const rawEventsPath = resolve(required("raw-events"));
const outputPath = resolve(required("output"));
const observerId = required("observer-id");
const observerKeyId = required("observer-key-id");

const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const events = (await readFile(rawEventsPath, "utf8")).trim().split(/\r?\n/u).map(line => JSON.parse(line));
const created = exactlyOne(events, "TRANSACTION_CREATED");
const attempted = exactlyOne(events, "SUBMISSION_ATTEMPTED_RECORDED");
const acknowledged = exactlyOne(events, "RPC_RESPONSE_RECEIVED");

if (evidence.evidenceVersion !== "sprint-10-devnet-validation@0.1.0" ||
    evidence.finalRpcStatus?.confirmationStatus !== "finalized" || evidence.finalRpcStatus?.err !== null ||
    acknowledged.data?.outcome !== "acknowledged" || acknowledged.data?.returnedSignature !== evidence.transactionSignature ||
    created.data?.signature !== evidence.transactionSignature || created.data?.validity?.blockhash !== evidence.blockhash ||
    String(created.data?.validity?.lastValidBlockHeight) !== String(evidence.lastValidBlockHeight)) {
  throw new Error("source evidence is not a consistent finalized Devnet lifecycle");
}

const experimentId = "grant-m1-devnet-observer-qualification";
const experimentVersion = "1";
const phase = "healthy";
const routeId = "alchemy-solana-devnet";
const transactionClass = "MATCHED_CONTROL";
const probeIndex = optionalInteger("probe-index", 0);
const observerSequence = optionalInteger("observer-sequence", 0);
const unitId = sha256Hex([
  experimentId, experimentVersion, phase, observerId, routeId, transactionClass, String(probeIndex),
].join("\u001f"));
const definition = {
  schemaVersion: "GrantM1DevnetObservationDefinition@0.1.0",
  experimentId,
  experimentVersion,
  phase,
  routeId,
  transactionClass,
  readerProfile: "solana-public_alchemy_onfinality",
  quorum: "2/3",
};
const job = {
  schemaVersion: "ObservationJob@0.1.0",
  resultId: randomUUID(),
  observerId,
  observerKeyId,
  observerSequence,
  unit: {
    experiment_id: experimentId,
    experiment_version: experimentVersion,
    phase,
    observer_id: observerId,
    route_id: routeId,
    transaction_class: transactionClass,
    probe_index: probeIndex,
    unit_id: unitId,
  },
  experimentDefinitionHash: sha256Hex(canonicalJson(definition)),
  signature: evidence.transactionSignature,
  submission: {
    attempt_id: sha256Hex(`${unitId}:attempt-1`),
    attempt_number: 1,
    outcome: "RPC_ACKNOWLEDGED",
    blockhash: evidence.blockhash,
    blockhash_context_slot: Number(created.data.validity.contextSlot),
    last_valid_block_height: Number(evidence.lastValidBlockHeight),
    serialized_size_bytes: 215,
    created_at: created.wallClock,
    submitted_at: attempted.wallClock,
    response_at: acknowledged.wallClock,
  },
  pollIntervalMs: 5_000,
  observationDeadlineMs: 120_000,
  readerRequestTimeoutMs: 10_000,
};

await mkdir(dirname(outputPath), { recursive: true });
const handle = await open(outputPath, "wx", 0o600);
try {
  await handle.writeFile(`${JSON.stringify(job)}\n`, "utf8");
  await handle.sync();
} finally {
  await handle.close();
}
process.stdout.write(`${JSON.stringify({
  status: "PASS",
  event: "GRANT_M1_DEVNET_OBSERVATION_JOB_PREPARED",
  resultId: job.resultId,
  experimentDefinitionHash: job.experimentDefinitionHash,
  output: outputPath,
})}\n`);

function required(name) {
  const value = args[name];
  if (value === undefined || value.length === 0) throw new Error(`missing --${name}`);
  return value;
}

function optionalInteger(name, fallback) {
  const value = args[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`--${name} must be a non-negative safe integer`);
  return parsed;
}

function exactlyOne(values, eventType) {
  const matches = values.filter(value => value.eventType === eventType);
  if (matches.length !== 1) throw new Error(`expected exactly one ${eventType} event`);
  return matches[0];
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("invalid arguments");
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, normalize(entry)]));
  }
  return value;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
