import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { verifyObservationAssignment } from "../packages/collector/dist/observation-assignment.js";
import { verifyProbeResult } from "../packages/probes/dist/signing.js";

const args = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(required("source-root"));
const authorityPath = resolve(required("authority"));
const outputRoot = resolve(required("output-root"));
const observerId = required("observer-id");
const observerKeyId = required("observer-key-id");

const assignment = await readJson(`${sourceRoot}/signed-assignment.json`);
const authority = await readJson(authorityPath);
const rawText = await readFile(`${sourceRoot}/raw-observations.jsonl`, "utf8");
const rawPolls = parseJsonl(rawText, "raw observations");
const acceptedRecords = parseJsonl(await readFile(`${sourceRoot}/collector-accepted-result.jsonl`, "utf8"), "accepted result");
const deliveries = parseJsonl(await readFile(`${sourceRoot}/observer-delivery.jsonl`, "utf8"), "delivery log");
const allowlist = await readJson(`${sourceRoot}/observer-allowlist.json`);
if (!Array.isArray(allowlist)) throw new Error("observer allowlist must be an array");
const observer = exactlyOne(allowlist.filter(entry => entry.observerId === observerId && entry.keyId === observerKeyId), "observer allowlist entry");
const accepted = exactlyOne(acceptedRecords.filter(entry => entry.result?.result_id === assignment.job?.resultId), "accepted result");
const signedResult = accepted.result;
const delivery = exactlyOne(deliveries.filter(entry => entry.result_id === signedResult.result_id), "delivery receipt");

const assignmentMidpoint = new Date((Date.parse(assignment.issuedAt) + Date.parse(assignment.expiresAt)) / 2);
verifyObservationAssignment(assignment, authority, assignmentMidpoint);
if (!verifyProbeResult(signedResult, observer)) throw new Error("observer ProbeResult signature is invalid");
if (assignment.job.resultId !== signedResult.result_id || assignment.job.signature !== signedResult.signature ||
    assignment.job.experimentDefinitionHash !== signedResult.experiment_definition_hash || assignment.job.observerSequence !== signedResult.observer_sequence) {
  throw new Error("assignment and signed result do not correlate");
}
if (rawPolls.length !== 1 || rawPolls.some(poll => poll.assignment_id !== assignment.assignmentId ||
    poll.assignment_payload_hash !== assignment.payloadHash || poll.signature !== signedResult.signature || poll.observer_id !== observerId)) {
  throw new Error("raw observations do not correlate to the assignment and result");
}
const claimIds = new Set(signedResult.reader_claims.map(claim => claim.claim_id));
const decision = exactlyOne(signedResult.quorum_decisions, "quorum decision");
if (signedResult.terminal_state !== "FINALIZED" || decision.decision_type !== "FINALIZED" ||
    decision.supporting_claim_ids.length !== 2 || decision.supporting_claim_ids.some(id => !claimIds.has(id))) {
  throw new Error("signed result does not contain a valid finalized 2/3 decision");
}
if (signedResult.reader_claims.filter(claim => claim.signature_status === "finalized" && claim.execution_error === undefined).length < 2) {
  throw new Error("signed result lacks two successful finalized claims");
}
if (delivery.payload_hash !== signedResult.payload_hash || delivery.observer_signature !== signedResult.observer_signature ||
    delivery.collector_status !== "ACCEPTED") throw new Error("delivery receipt does not match the accepted signed result");

await mkdir(outputRoot, { recursive: false });
const files = [
  ["assignment-authority.json", `${JSON.stringify(authority, null, 2)}\n`],
  ["observer-allowlist-entry.json", `${JSON.stringify(observer, null, 2)}\n`],
  ["signed-assignment.json", `${JSON.stringify(assignment, null, 2)}\n`],
  ["raw-observations.jsonl", rawText],
  ["signed-result.json", `${JSON.stringify(signedResult, null, 2)}\n`],
  ["delivery-receipt.json", `${JSON.stringify(delivery, null, 2)}\n`],
];
const hashes = {};
for (const [name, contents] of files) {
  await writeExclusive(`${outputRoot}/${name}`, contents);
  hashes[name] = sha256(contents);
}
const manifest = {
  schema_version: "GrantM1DevnetEvidenceBundle@0.1.0",
  observer_id: observerId,
  observer_key_id: observerKeyId,
  result_id: signedResult.result_id,
  transaction_signature: signedResult.signature,
  terminal_state: signedResult.terminal_state,
  finalized_claim_count: signedResult.reader_claims.filter(claim => claim.signature_status === "finalized" && claim.execution_error === undefined).length,
  reader_error_count: signedResult.reader_claims.filter(claim => claim.reader_error !== undefined).length,
  collector_sequence: accepted.collector_sequence,
  collected_at: accepted.collected_at,
  files: hashes,
  claim_boundary: "One real assignment-correlated Solana Devnet observation; not proof of reader operational independence or Milestone 1 acceptance."
};
await writeExclusive(`${outputRoot}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: "PASS", gate: "GRANT_M1_DEVNET_EVIDENCE_BUNDLE", output: outputRoot, files: files.length + 1, resultId: signedResult.result_id })}\n`);

async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
function parseJsonl(text, label) {
  if (text.length === 0 || !text.endsWith("\n")) throw new Error(`${label} must be non-empty newline-terminated JSONL`);
  return text.trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
}
function exactlyOne(values, label) {
  if (!Array.isArray(values) || values.length !== 1) throw new Error(`expected exactly one ${label}`);
  return values[0];
}
async function writeExclusive(path, contents) {
  const handle = await open(path, "wx", 0o644);
  try { await handle.writeFile(contents, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function required(name) {
  const value = args[name];
  if (value === undefined || value.length === 0) throw new Error(`missing --${name}`);
  return value;
}
function parseArgs(values) {
  if (values.length % 2 !== 0) throw new Error("arguments must use --name value pairs");
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index]; const value = values[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("invalid arguments");
    parsed[name.slice(2)] = value;
  }
  return parsed;
}
