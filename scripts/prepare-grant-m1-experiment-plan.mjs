import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  importAssignmentAuthorityPrivateKey,
  signGrantM1ExperimentPlan,
} from "../packages/collector/dist/index.js";

const args = parseArgs(process.argv.slice(2));
const authorityPath = resolve(requiredSingle("authority"));
const outputPath = resolve(requiredSingle("output"));
const observerIds = requiredMany("observer-id");
const probeIndex = optionalInteger("probe-index", Date.now());
const issuedAt = optionalSingle("issued-at") ?? new Date().toISOString();

if (new Set(observerIds).size !== observerIds.length || observerIds.length < 3) {
  throw new Error("at least three unique --observer-id values are required");
}

const authorityDocument = JSON.parse(await readFile(authorityPath, "utf8"));
const authority = importAssignmentAuthorityPrivateKey(authorityDocument);
const definition = {
  schemaVersion: "GrantM1DevnetObservationDefinition@0.1.0",
  experimentId: "grant-m1-devnet-observer-qualification",
  experimentVersion: "1",
  phase: "healthy",
  routeId: "alchemy-solana-devnet",
  transactionClass: "MATCHED_CONTROL",
  readerProfile: "solana-public_alchemy_onfinality",
  quorum: "2/3",
};
const plan = signGrantM1ExperimentPlan({
  schema_version: "GrantM1ExperimentPlan@0.1.0",
  plan_id: optionalSingle("plan-id") ?? randomUUID(),
  issuer_id: authority.issuerId,
  issuer_key_id: authority.keyId,
  issued_at: issuedAt,
  experiment_definition_hash: sha256Hex(canonicalJson(definition)),
  observers: observerIds.map(observerId => ({
    observer_id: observerId,
    expected_unit_ids: [sha256Hex([
      definition.experimentId,
      definition.experimentVersion,
      definition.phase,
      observerId,
      definition.routeId,
      definition.transactionClass,
      String(probeIndex),
    ].join("\u001f"))],
  })),
}, authority);

await mkdir(dirname(outputPath), { recursive: true });
const handle = await open(outputPath, "wx", 0o600);
try {
  await handle.writeFile(`${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await handle.sync();
} finally {
  await handle.close();
}

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  event: "GRANT_M1_EXPERIMENT_PLAN_SIGNED",
  planId: plan.plan_id,
  issuedAt: plan.issued_at,
  observerCount: plan.observers.length,
  probeIndex,
  experimentDefinitionHash: plan.experiment_definition_hash,
  output: outputPath,
})}\n`);

function parseArgs(values) {
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("invalid arguments");
    const normalized = key.slice(2);
    parsed.set(normalized, [...(parsed.get(normalized) ?? []), value]);
  }
  return parsed;
}

function requiredSingle(name) {
  const values = args.get(name);
  if (values?.length !== 1 || values[0].length === 0) throw new Error(`exactly one --${name} is required`);
  return values[0];
}

function requiredMany(name) {
  const values = args.get(name);
  if (!Array.isArray(values) || values.some(value => value.length === 0)) throw new Error(`at least one --${name} is required`);
  return values;
}

function optionalSingle(name) {
  const values = args.get(name);
  if (values === undefined) return undefined;
  if (values.length !== 1 || values[0].length === 0) throw new Error(`at most one --${name} is allowed`);
  return values[0];
}

function optionalInteger(name, fallback) {
  const value = optionalSingle(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`--${name} must be a non-negative safe integer`);
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
