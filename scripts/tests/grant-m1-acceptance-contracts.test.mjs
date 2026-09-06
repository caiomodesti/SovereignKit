import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { deriveGrantM1TerminalFromClaims, verifyGrantM1Acceptance } from "../lib/grant-m1-acceptance.mjs";

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

test("rejects three observer identities backed by one actual public key", async () => {
  const fixture = await makeFixture({ reuseObserverKey: true });
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /observer public key values must be non-empty and unique/u);
});

test("rejects a signed terminal state that is not recomputed from raw polls", async () => {
  const fixture = await makeFixture();
  const path = "observers/observer-a/raw-observations.jsonl";
  const poll = JSON.parse((await readFile(join(fixture.root, path), "utf8")).trim());
  poll.claims = poll.claims.map(claim => ({ ...claim, signature_status: null, observed_block_height: 1 }));
  await writeJsonl(join(fixture.root, path), [poll]);
  await updateReferenceHash(fixture.root, path);
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /raw-to-derived terminal state/u);
});

test("rejects EXPIRED when negative status lookups contain reader errors", async () => {
  const claims = ["a", "b", "c"].map(reader => ({
    claim_id: `claim-${reader}`,
    reader_id: `reader-${reader}`,
    observed_at: "2026-08-25T01:00:00.000Z",
    signature_status: null,
    observed_block_height: 2_000,
    reader_error: "RPC",
  }));
  assert.equal(deriveGrantM1TerminalFromClaims(claims, 1_500), undefined);
  const clean = claims.map(({ reader_error: _readerError, ...claim }) => claim);
  assert.equal(deriveGrantM1TerminalFromClaims(clean, 1_500)?.terminal, "EXPIRED");
  const conflicting = clean.map((claim, index) => index === 2 ? { ...claim, signature_status: "processed" } : claim);
  assert.equal(deriveGrantM1TerminalFromClaims(conflicting, 1_500), undefined);
  assert.throws(() => deriveGrantM1TerminalFromClaims([clean[0], clean[0], clean[2]], 1_500), /unique reader claims/u);
});

test("requires compatible slots and equivalent execution errors for terminal quorum", () => {
  const claims = [0, 1, 2].map(index => ({
    claim_id: `claim-${index}`, reader_id: `reader-${index}`,
    observed_at: "2026-08-25T01:00:00.000Z",
    signature_status: "finalized", transaction_slot: 900 + index,
  }));
  assert.equal(deriveGrantM1TerminalFromClaims(claims, 1500), undefined);
  const aligned = claims.map(claim => ({ ...claim, transaction_slot: 900 }));
  assert.equal(deriveGrantM1TerminalFromClaims(aligned, 1500)?.terminal, "FINALIZED");
  const failures = aligned.map((claim, index) => ({ ...claim, execution_error: { code: index } }));
  assert.equal(deriveGrantM1TerminalFromClaims(failures, 1500), undefined);
  failures[1].execution_error = { code: 0 };
  assert.equal(deriveGrantM1TerminalFromClaims(failures, 1500)?.terminal, "OBSERVED_EXECUTION_FAILED");
});

test("rejects a truncated result set against its expected-unit commitment", async () => {
  const fixture = await makeFixture();
  const path = join(fixture.root, "evidence-index.json");
  const index = JSON.parse(await readFile(path, "utf8"));
  index.observers[0].expected_unit_count = 2;
  await writeJson(path, index);
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /does not match the signed experiment plan/u);
});

test("rejects rewriting the signed experiment plan with the evidence index", async () => {
  const fixture = await makeFixture();
  const path = join(fixture.root, "experiment-plan.json");
  const plan = JSON.parse(await readFile(path, "utf8"));
  plan.observers[0].expected_unit_ids[0] = "f".repeat(64);
  await writeJson(path, plan);
  await assert.rejects(() => verifyGrantM1Acceptance(fixture.root), /plan payload hash is invalid/u);
});

async function makeFixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "sovereignkit-m1-acceptance-"));
  const runtimeCommit = "a".repeat(40);
  const observers = [];
  const allowlist = [];
  const indexEntries = [];
  const planEntries = [];
  const assignmentAuthority = generateKeyPairSync("ed25519");
  const sharedObserverIdentity = options.reuseObserverKey ? generateKeyPairSync("ed25519") : undefined;
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
    const identity = sharedObserverIdentity ?? generateKeyPairSync("ed25519");
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
    planEntries.push({ observer_id: observerId, expected_unit_ids: [unitId] });
    const terminalState = "FINALIZED";
    const claims = ["a", "b", "c"].map(reader => ({
      claim_id: `${observerId}-claim-${reader}`,
      reader_id: `reader-${reader}`,
      observed_at: "2026-08-25T01:00:00.000Z",
      signature_status: "finalized",
      transaction_slot: 900,
      observed_block_height: 1_000,
    }));
    const submission = {
      attempt_id: sha256Hex(`${observerId}-attempt-1`),
      attempt_number: 1,
      outcome: "RPC_ACKNOWLEDGED",
      blockhash: "1".repeat(32),
      blockhash_context_slot: 1,
      last_valid_block_height: 1_500,
      serialized_size_bytes: 215,
      created_at: "2026-08-25T00:59:30.000Z",
      submitted_at: "2026-08-25T00:59:31.000Z",
      response_at: "2026-08-25T00:59:32.000Z",
    };
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
      submission,
      reader_claims: claims,
      quorum_decisions: [{ decision_type: terminalState, supporting_claim_ids: claims.slice(0, 2).map(claim => claim.claim_id), quorum_rule_version: "ObservationQuorum@0.1.0" }],
      terminal_state: terminalState,
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
        claims,
      }], true],
      health_history: [`observers/${observerId}/health.json`, { observer_id: observerId, ready: true, clock_synchronized: true, key_permissions_verified: true }, false],
      restart_evidence: [`observers/${observerId}/restart.json`, { observer_id: observerId, restart_succeeded: true, recovered_records: 1 }, false],
      provider_evidence: [providerPath, { observer_id: observerId, provider_label: providerLabel, region, network_asn: asn, corroborated: true }, false],
      failure_matrix: [`observers/${observerId}/failure-matrix.json`, { observer_id: observerId, cases: { HEALTHY: "PASS", DELAYED: "PASS", ONE_READER_UNAVAILABLE: "PASS", TWO_READERS_UNAVAILABLE: "PASS", DISAGREEMENT: "PASS" } }, false],
    };
    const indexEntry = {
      observer_id: observerId,
      expected_unit_count: 1,
      expected_unit_ids_sha256: sha256Hex(unitId),
    };
    for (const [field, [path, value, jsonl]] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      if (jsonl) await writeJsonl(join(root, path), value);
      else await writeJson(join(root, path), value);
      indexEntry[field] = [{ path, sha256: sha256Hex(await readFile(join(root, path))) }];
    }
    indexEntries.push(indexEntry);
  }
  const planUnsigned = {
    schema_version: "GrantM1ExperimentPlan@0.1.0",
    plan_id: "20000000-0000-4000-8000-000000000000",
    issuer_id: assignmentAuthorityEntry.issuerId,
    issuer_key_id: assignmentAuthorityEntry.keyId,
    issued_at: "2026-08-25T00:58:00.000Z",
    experiment_definition_hash: sha256Hex("experiment"),
    observers: planEntries,
  };
  const planPayloadHash = sha256Hex(canonicalJson(planUnsigned));
  const experimentPlan = { ...planUnsigned, payload_hash: planPayloadHash, issuer_signature: sign(null, Buffer.from(canonicalJson({ ...planUnsigned, payload_hash: planPayloadHash })), assignmentAuthority.privateKey).toString("base64url") };
  await Promise.all([
    writeJson(join(root, "observer-registry.json"), { schema_version: "GrantObserverRegistry@0.1.0", generated_at: "2026-08-25T01:00:00.000Z", observers }),
    writeJson(join(root, "allowlist.json"), allowlist),
    writeJson(join(root, "assignment-authorities.json"), [assignmentAuthorityEntry]),
    writeJson(join(root, "experiment-plan.json"), experimentPlan),
    writeJson(join(root, "evidence-index.json"), { schema_version: "GrantM1EvidenceIndex@0.4.0", generated_at: "2026-08-25T01:00:00.000Z", observers: indexEntries }),
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
