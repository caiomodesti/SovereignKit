import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { verifyObservationAssignment } from "../packages/collector/dist/observation-assignment.js";
import { verifyProbeResult } from "../packages/probes/dist/signing.js";

const root = resolve(process.argv[2] ?? "fixtures/grant-m1/observer-aws-a-devnet-20260901");
const manifest = await readJson("manifest.json");
if (manifest.schema_version !== "GrantM1DevnetEvidenceBundle@0.1.0" || manifest.terminal_state !== "FINALIZED" ||
    manifest.finalized_claim_count < 2 || manifest.reader_error_count !== 1) throw new Error("bundle manifest claim boundary is invalid");
const expectedNames = ["assignment-authority.json", "observer-allowlist-entry.json", "signed-assignment.json", "raw-observations.jsonl", "signed-result.json", "delivery-receipt.json"];
if (Object.keys(manifest.files).sort().join("\n") !== [...expectedNames].sort().join("\n")) throw new Error("bundle manifest file set is invalid");
for (const name of expectedNames) {
  const bytes = await readBounded(name);
  if (sha256(bytes) !== manifest.files[name]) throw new Error(`bundle hash mismatch for ${name}`);
}
const authority = await readJson("assignment-authority.json");
const observer = await readJson("observer-allowlist-entry.json");
const assignment = await readJson("signed-assignment.json");
const signedResult = await readJson("signed-result.json");
const delivery = await readJson("delivery-receipt.json");
const rawPolls = parseJsonl((await readBounded("raw-observations.jsonl")).toString("utf8"));
verifyObservationAssignment(assignment, authority, new Date((Date.parse(assignment.issuedAt) + Date.parse(assignment.expiresAt)) / 2));
if (!verifyProbeResult(signedResult, observer)) throw new Error("bundle ProbeResult signature is invalid");
if (manifest.observer_id !== observer.observerId || manifest.observer_key_id !== observer.keyId ||
    manifest.result_id !== signedResult.result_id || manifest.transaction_signature !== signedResult.signature) {
  throw new Error("bundle manifest identity does not correlate");
}
if (assignment.job.resultId !== signedResult.result_id || assignment.job.signature !== signedResult.signature ||
    assignment.job.observerSequence !== signedResult.observer_sequence || assignment.job.experimentDefinitionHash !== signedResult.experiment_definition_hash) {
  throw new Error("bundle assignment does not correlate to signed result");
}
if (rawPolls.length !== 1 || rawPolls.some(poll => poll.assignment_id !== assignment.assignmentId ||
    poll.assignment_payload_hash !== assignment.payloadHash || poll.signature !== signedResult.signature || poll.observer_id !== signedResult.observer_id)) {
  throw new Error("bundle raw poll does not correlate");
}
const finalized = signedResult.reader_claims.filter(claim => claim.signature_status === "finalized" && claim.execution_error === undefined);
const errors = signedResult.reader_claims.filter(claim => claim.reader_error !== undefined);
const decision = signedResult.quorum_decisions[0];
const claimIds = new Set(signedResult.reader_claims.map(claim => claim.claim_id));
if (signedResult.reader_claims.length !== 3 || finalized.length !== manifest.finalized_claim_count || errors.length !== manifest.reader_error_count ||
    signedResult.terminal_state !== "FINALIZED" || decision?.decision_type !== "FINALIZED" || decision.supporting_claim_ids.length !== 2 ||
    decision.supporting_claim_ids.some(id => !claimIds.has(id))) throw new Error("bundle finalized quorum is invalid");
if (delivery.result_id !== signedResult.result_id || delivery.payload_hash !== signedResult.payload_hash ||
    delivery.observer_signature !== signedResult.observer_signature || delivery.collector_status !== "ACCEPTED") {
  throw new Error("bundle delivery receipt does not correlate");
}
process.stdout.write(`${JSON.stringify({ status: "PASS", gate: "GRANT_M1_DEVNET_EVIDENCE_BUNDLE", observerId: manifest.observer_id, resultId: manifest.result_id, finalizedClaims: finalized.length, readerErrors: errors.length })}\n`);

async function readJson(name) { return JSON.parse((await readBounded(name)).toString("utf8")); }
async function readBounded(name) {
  const path = resolve(root, name);
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error("bundle path escaped root");
  const bytes = await readFile(path);
  if (bytes.length === 0 || bytes.length > 1024 * 1024) throw new Error(`bundle file size is invalid for ${name}`);
  return bytes;
}
function parseJsonl(text) {
  if (!text.endsWith("\n")) throw new Error("raw observations must be newline terminated");
  return text.trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
