import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { verifyGrantM1Acceptance } from "../lib/grant-m1-acceptance.mjs";

test("accepts three cryptographically valid and content-correlated observers", async () => {
  const fixture = await makeFixture();
  const result = await verifyGrantM1Acceptance(fixture.root);
  assert.equal(result.status, "PASS");
  assert.equal(result.observers, 3);
  assert.equal(result.assignments, 3);
  assert.equal(result.signedResults, 3);
  assert.equal(result.rawPolls, 3);
});

test("rejects an indexed but empty evidence artifact", async () => {
  const fixture = await makeFixture();
  const path = "observers/observer-a/health.json";
  await writeFile(join(fixture.root, path), "");
  await updateReferenceHash(fixture.root, path);
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /is empty/u);
});

test("rejects tampered signed results even when the index hash is updated", async () => {
  const fixture = await makeFixture();
  const path = "observers/observer-b/signed-results.jsonl";
  const result = JSON.parse((await readFile(join(fixture.root, path), "utf8")).trim());
  result.submission.outcome = "RPC_REJECTED";
  await writeJsonl(join(fixture.root, path), [result]);
  await updateReferenceHash(fixture.root, path);
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /payload hash is invalid/u);
});

test("rejects tampered assignment provenance even when the evidence hash is updated", async () => {
  const fixture = await makeFixture();
  const path = "observers/observer-a/signed-assignments.jsonl";
  const assignment = JSON.parse((await readFile(join(fixture.root, path), "utf8")).trim());
  assignment.job.submission.outcome = "RPC_REJECTED";
  await writeJsonl(join(fixture.root, path), [assignment]);
  await updateReferenceHash(fixture.root, path);
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /assignment payload hash is invalid/u);
});

test("rejects raw polls that are not correlated to the signed assignment", async () => {
  const fixture = await makeFixture();
  const path = "observers/observer-b/raw-observations.jsonl";
  const poll = JSON.parse((await readFile(join(fixture.root, path), "utf8")).trim());
  poll.assignment_id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await writeJsonl(join(fixture.root, path), [poll]);
  await updateReferenceHash(fixture.root, path);
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /not correlated to an indexed signed assignment/u);
});

test("rejects cross-root and cross-observer evidence paths", async () => {
  const fixture = await makeFixture();
  const indexPath = join(fixture.root, "evidence-index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  index.observers[0].health_history[0].path = "../outside.json";
  await writeJson(indexPath, index);
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /must be scoped under/u);
});

test("rejects private observer key material even with a valid file hash", async () => {
  const fixture = await makeFixture();
  const path = "observers/observer-c/provider.json";
  const provider = JSON.parse(await readFile(join(fixture.root, path), "utf8"));
  provider.privateKeyPkcs8Base64 = "forbidden";
  await writeJson(join(fixture.root, path), provider);
  await updateReferenceHash(fixture.root, path);
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /forbidden private key material/u);
});

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "sovereignkit-m1-acceptance-"));
  const runtimeCommit = "a".repeat(40);
  const observers = [];
  const allowlist = [];
  const indexEntries = [];
  const assignmentAuthority = generateKeyPairSync("ed25519");
  const assignmentAuthorityEntry = {
    issuerId: "grant-coordinator",
    keyId: "assignment-key-1",
    publicKeySpkiBase64: assignmentAuthority.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    validFrom: "2026-08-24T00:00:00.000Z",
    validUntil: "2026-12-31T23:59:59.999Z",
  };
  for (const [position, suffix] of ["a", "b", "c"].entries()) {
    const observerId = `observer-${suffix}`;
    const keyId = `key-${suffix}`;
    const providerLabel = `Provider ${suffix.toUpperCase()}`;
    const region = `region-${suffix}`;
    const asn = 64_500 + position;
    const identity = generateKeyPairSync("ed25519");
    const publicKeySpkiBase64 = identity.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const providerPath = `observers/${observerId}/provider.json`;
    observers.push({
      observer_id: observerId,
      key_id: keyId,
      provider_label: providerLabel,
      provider_account_fingerprint: sha256Hex(`account-${suffix}`),
      instance_id_sanitized: sha256Hex(`instance-${suffix}`),
      region,
      country_code: "US",
      network_asn: asn,
      runtime_commit: runtimeCommit,
      provisioned_at: "2026-08-25T00:00:00.000Z",
      independence_status: "CORROBORATED",
      evidence_refs: [providerPath],
    });
    allowlist.push({ observerId, keyId, publicKeySpkiBase64, validFrom: "2026-08-24T00:00:00.000Z", validUntil: "2026-12-31T23:59:59.999Z" });
    const transactionSignature = String(position + 1).repeat(88);
    const unit = {
      experiment_id: "grant-m1-test",
      experiment_version: "1",
      phase: "healthy",
      observer_id: observerId,
      route_id: "route-a",
      transaction_class: "MATCHED_CONTROL",
      probe_index: 0,
    };
    const unitId = sha256Hex([unit.experiment_id, unit.experiment_version, unit.phase, unit.observer_id, unit.route_id, unit.transaction_class, String(unit.probe_index)].join("\u001f"));
    const claims = ["a", "b", "c"].map(reader => ({ claim_id: `${observerId}-claim-${reader}`, reader_id: `reader-${reader}` }));
    const unsigned = {
      schema_version: "0.1.0",
      result_id: `00000000-0000-4000-8000-00000000000${position}`,
      idempotency_key: sha256Hex(`${observerId}\u001f${unitId}`),
      observer_id: observerId,
      observer_key_id: keyId,
      observer_sequence: 0,
      unit: { ...unit, unit_id: unitId },
      experiment_definition_hash: sha256Hex("experiment"),
      signature: transactionSignature,
      submission: { attempt_number: 1, outcome: "RPC_ACKNOWLEDGED" },
      reader_claims: claims,
      quorum_decisions: [{ decision_type: "FINALIZED", supporting_claim_ids: claims.slice(0, 2).map(claim => claim.claim_id), quorum_rule_version: "ObservationQuorum@0.1.0" }],
      terminal_state: "FINALIZED",
      observer_wall_time: "2026-08-25T01:00:00.000Z",
    };
    const payloadHash = sha256Hex(canonicalJson(unsigned));
    const signable = canonicalJson({ ...unsigned, payload_hash: payloadHash });
    const signedResult = { ...unsigned, payload_hash: payloadHash, observer_signature: sign(null, Buffer.from(signable), identity.privateKey).toString("base64url") };
    const assignmentUnsigned = {
      schemaVersion: "ObservationAssignment@0.1.0",
      assignmentId: `10000000-0000-4000-8000-00000000000${position}`,
      issuerId: assignmentAuthorityEntry.issuerId,
      issuerKeyId: assignmentAuthorityEntry.keyId,
      issuedAt: "2026-08-25T00:59:00.000Z",
      expiresAt: "2026-08-25T02:00:00.000Z",
      job: {
        schemaVersion: "ObservationJob@0.1.0",
        resultId: unsigned.result_id,
        observerId: unsigned.observer_id,
        observerKeyId: unsigned.observer_key_id,
        observerSequence: unsigned.observer_sequence,
        unit: unsigned.unit,
        experimentDefinitionHash: unsigned.experiment_definition_hash,
        signature: unsigned.signature,
        submission: unsigned.submission,
        pollIntervalMs: 100,
        observationDeadlineMs: 1_000,
        readerRequestTimeoutMs: 100,
      },
    };
    const assignmentPayloadHash = sha256Hex(canonicalJson(assignmentUnsigned));
    const signedAssignment = { ...assignmentUnsigned, payloadHash: assignmentPayloadHash, issuerSignature: sign(null, Buffer.from(canonicalJson({ ...assignmentUnsigned, payloadHash: assignmentPayloadHash })), assignmentAuthority.privateKey).toString("base64url") };
    const files = {
      assignment_provenance: [`observers/${observerId}/signed-assignments.jsonl`, [signedAssignment], true],
      signed_results: [`observers/${observerId}/signed-results.jsonl`, [signedResult], true],
      raw_observations: [`observers/${observerId}/raw-observations.jsonl`, [{
        schema_version: "RawObservationPoll@0.2.0",
        assignment_id: signedAssignment.assignmentId,
        assignment_payload_hash: signedAssignment.payloadHash,
        poll_index: 0,
        observed_at: "2026-08-25T01:00:00.000Z",
        observer_id: observerId,
        signature: transactionSignature,
        claims: ["a", "b", "c"].map(reader => ({ reader_id: `reader-${reader}` })),
      }], true],
      health_history: [`observers/${observerId}/health.json`, { observer_id: observerId, ready: true, clock_synchronized: true, key_permissions_verified: true }, false],
      restart_evidence: [`observers/${observerId}/restart.json`, { observer_id: observerId, restart_succeeded: true, recovered_records: 1 }, false],
      provider_evidence: [providerPath, { observer_id: observerId, provider_label: providerLabel, region, network_asn: asn, corroborated: true }, false],
      failure_matrix: [`observers/${observerId}/failure-matrix.json`, { observer_id: observerId, cases: { HEALTHY: "PASS", DELAYED: "PASS", ONE_READER_UNAVAILABLE: "PASS", TWO_READERS_UNAVAILABLE: "PASS", DISAGREEMENT: "PASS" } }, false],
    };
    const indexEntry = { observer_id: observerId };
    for (const [field, [path, value, jsonl]] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      if (jsonl) await writeJsonl(join(root, path), value);
      else await writeJson(join(root, path), value);
      indexEntry[field] = [{ path, sha256: sha256Hex(await readFile(join(root, path))) }];
    }
    indexEntries.push(indexEntry);
  }
  await Promise.all([
    writeJson(join(root, "observer-registry.json"), { schema_version: "GrantObserverRegistry@0.1.0", generated_at: "2026-08-25T01:00:00.000Z", observers }),
    writeJson(join(root, "allowlist.json"), allowlist),
    writeJson(join(root, "assignment-authorities.json"), [assignmentAuthorityEntry]),
    writeJson(join(root, "evidence-index.json"), { schema_version: "GrantM1EvidenceIndex@0.3.0", generated_at: "2026-08-25T01:00:00.000Z", observers: indexEntries }),
  ]);
  return { root };
}

async function updateReferenceHash(root, path) {
  const indexPath = join(root, "evidence-index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  for (const observer of index.observers) {
    for (const field of ["assignment_provenance", "signed_results", "raw_observations", "health_history", "restart_evidence", "provider_evidence", "failure_matrix"]) {
      for (const reference of observer[field]) if (reference.path === path) reference.sha256 = sha256Hex(await readFile(join(root, path)));
    }
  }
  await writeJson(indexPath, index);
}

function canonicalJson(value) { return JSON.stringify(normalize(value)); }
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, normalize(entry)]));
  return value;
}
function sha256Hex(value) { return createHash("sha256").update(value).digest("hex"); }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
async function writeJsonl(path, values) { await writeFile(path, `${values.map(value => JSON.stringify(value)).join("\n")}\n`, "utf8"); }
