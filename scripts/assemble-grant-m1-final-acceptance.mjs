import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const sourceRoot = resolve(required("--source-root"));
const outputRoot = resolve(required("--output"));
const generatedAt = new Date().toISOString();
const repoRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, value => value.slice(1)));

const observerDefinitions = [
  {
    observerId: "observer-aws-a",
    keyId: "aws-a-key-2026-08-31",
    host: "host-a",
    assignment: "signed-assignment.json",
    result: "signed-result.json",
    raw: "raw-observations.jsonl",
    delivery: "observer-delivery.jsonl",
    providerLabel: "Amazon Web Services",
    region: "sa-east-1",
    countryCode: "BR",
    networkAsns: [16509],
    providerFixture: "fixtures/grant-m1/observer-aws-a-network-20260909.json",
    qualificationFixture: "fixtures/grant-m1/observer-aws-a-common-runtime-requalification-20260908.json",
    runtimeCommit: "f4c70ea10198e5313eec0467f6a7b9222ff9e8f3",
    provisionedAt: "2026-08-31T00:00:00.000Z",
    allowlistFixture: "fixtures/grant-m1/observer-aws-a-common-runtime-devnet-20260908/observer-allowlist-entry.json",
  },
  {
    observerId: "observer-google-e2-micro",
    keyId: "observer-google-e2-micro-2026-09-03",
    host: "host-b",
    assignment: "sk-b-assignment.json",
    result: "sk-b-result.json",
    raw: "sk-b-raw.jsonl",
    delivery: "sk-b-delivery.jsonl",
    providerLabel: "Google Cloud Platform",
    region: "us-central1",
    countryCode: "US",
    networkAsns: [43515, 15169],
    providerFixture: "fixtures/grant-m1/observer-google-b-provider-20260909.json",
    qualificationFixture: "fixtures/grant-m1/observer-google-b-common-runtime-requalification-20260909.json",
    runtimeCommit: "f4c70ea10198e5313eec0467f6a7b9222ff9e8f3",
    provisionedAt: "2026-09-03T01:00:00.000Z",
    allowlistFixture: "fixtures/grant-m1/observer-google-b-common-runtime-devnet-20260909/observer-allowlist-entry.json",
  },
  {
    observerId: "observer-oracle-a1",
    keyId: "observer-oracle-a1-2026-09-04",
    host: "host-c",
    assignment: "signed-assignment.json",
    result: "signed-result.json",
    raw: "raw-observations.jsonl",
    delivery: "observer-delivery.jsonl",
    providerLabel: "Oracle Cloud Infrastructure",
    region: "sa-saopaulo-1",
    countryCode: "BR",
    networkAsns: [31898],
    providerFixture: "fixtures/grant-m1/observer-oracle-c-provider-20260909.json",
    qualificationFixture: "fixtures/grant-m1/observer-oracle-c-soak-20260906.json",
    restartFixture: "fixtures/grant-m1/observer-oracle-c-pre-soak-20260904.json",
    runtimeCommit: "49557b234b7e359dcd77ca198639b6e0a936dee2",
    provisionedAt: "2026-09-04T00:00:00.000Z",
    allowlistFixture: "fixtures/grant-m1/observer-oracle-c-devnet-20260906/observer-allowlist-entry.json",
  },
];

const plan = await readJson(resolve(sourceRoot, "experiment-plan.json"));
await writeExclusive(resolve(outputRoot, "experiment-plan.json"), plan);
const authority = await readJson(resolve(repoRoot, "fixtures/grant-m1/observer-aws-a-common-runtime-devnet-20260908/assignment-authority.json"));
await writeExclusive(resolve(outputRoot, "assignment-authorities.json"), [authority]);

const allowlist = [];
const registry = [];
const indexObservers = [];
for (const definition of observerDefinitions) {
  const sourceHost = resolve(sourceRoot, definition.host);
  const assignment = await readJson(resolve(sourceHost, definition.assignment));
  const storedResult = await readJson(resolve(sourceHost, definition.result));
  if (assignment.job?.resultId !== storedResult.result_id || storedResult.observer_id !== definition.observerId || storedResult.observer_key_id !== definition.keyId) {
    throw new Error(`${definition.observerId} source identity or assignment/result correlation failed`);
  }
  const planned = plan.observers?.find(entry => entry.observer_id === definition.observerId)?.expected_unit_ids;
  if (plan.experiment_definition_hash !== storedResult.experiment_definition_hash || planned?.length !== 1 || planned[0] !== storedResult.unit?.unit_id) {
    throw new Error(`${definition.observerId} does not match the signed experiment plan`);
  }
  const rawBytes = await readFile(resolve(sourceHost, definition.raw));
  const deliveries = parseJsonl(await readFile(resolve(sourceHost, definition.delivery), "utf8"));
  const delivery = deliveries.find(entry => (entry.result_id ?? entry.resultId) === storedResult.result_id);
  if (delivery?.collector_status !== "ACCEPTED" || !/^[a-f0-9]{64}$/u.test(delivery.payload_hash) || typeof delivery.observer_signature !== "string") {
    throw new Error(`${definition.observerId} lacks a matching ACCEPTED delivery receipt`);
  }
  const result = { ...storedResult, payload_hash: delivery.payload_hash, observer_signature: delivery.observer_signature };

  const providerSourcePath = resolve(repoRoot, definition.providerFixture);
  const providerSource = await readJson(providerSourcePath);
  if (providerSource.provider_account_fingerprint_sha256 === undefined || providerSource.instance_fingerprint_sha256 === undefined || providerSource.corroborated !== true) {
    throw new Error(`${definition.observerId} provider source is incomplete`);
  }
  const qualificationSourcePath = resolve(repoRoot, definition.qualificationFixture);
  const qualification = await readJson(qualificationSourcePath);
  const restartSourcePath = resolve(repoRoot, definition.restartFixture ?? definition.qualificationFixture);
  const restartSource = await readJson(restartSourcePath);
  const preflight = qualification.post_soak_preflight;
  const restartPassed = definition.restartFixture === undefined
    ? qualification.recovery_gate?.automatic_delivery === true
    : restartSource.transport_gates?.observer_service_restart_persistence === "PASS" && restartSource.transport_gates?.full_vm_reboot_recovery === "PASS";
  if (preflight?.ready !== true || preflight.clock_synchronized !== true || preflight.key_mode_0600 !== true || restartPassed !== true) {
    throw new Error(`${definition.observerId} health or recovery source is incomplete`);
  }

  const files = {
    assignment_provenance: ["signed-assignment.json", `${JSON.stringify(assignment)}\n`],
    signed_results: ["signed-result.json", `${JSON.stringify(result)}\n`],
    delivery_receipts: ["delivery-receipt.json", `${JSON.stringify(delivery)}\n`],
    raw_observations: ["raw-observations.jsonl", rawBytes],
    health_history: ["health.json", json({
      schema_version: "GrantM1NormalizedHealth@0.1.0",
      observer_id: definition.observerId,
      captured_at: preflight.captured_at,
      ready: true,
      clock_synchronized: true,
      key_permissions_verified: true,
      source_artifact: definition.qualificationFixture,
      source_sha256: await fileHash(qualificationSourcePath),
    })],
    restart_evidence: ["restart.json", json({
      schema_version: "GrantM1NormalizedRestartEvidence@0.1.0",
      observer_id: definition.observerId,
      restart_succeeded: true,
      recovered_records: definition.restartFixture === undefined ? qualification.recovery_gate.delivered_count_increment : restartSource.transport_gates.delivery_receipt_count_after_reboot,
      source_artifact: definition.restartFixture ?? definition.qualificationFixture,
      source_sha256: await fileHash(restartSourcePath),
    })],
    provider_evidence: ["provider.json", json({
      schema_version: "GrantM1NormalizedProviderEvidence@0.1.0",
      observer_id: definition.observerId,
      provider_label: definition.providerLabel,
      region: definition.region,
      country_code: definition.countryCode,
      network_asns: definition.networkAsns,
      provider_account_fingerprint: providerSource.provider_account_fingerprint_sha256,
      instance_id_sanitized: providerSource.instance_fingerprint_sha256,
      corroborated: true,
      source_artifact: definition.providerFixture,
      source_sha256: await fileHash(providerSourcePath),
    })],
    runtime_qualification: ["runtime-qualification.json", json({
      schema_version: "GrantM1RuntimeCompatibilityQualification@0.1.0",
      observer_id: definition.observerId,
      runtime_commit: definition.runtimeCommit,
      evidence_protocol_version: "GrantM1EvidenceProtocol@0.1.0",
      status: "QUALIFIED",
      compatibility_status: "REVIEWED_COMPATIBLE",
      host_stability_admitted: true,
      semantic_recomputation_supported: true,
      source_artifact: definition.qualificationFixture,
      source_anchor_sha256: await fileHash(qualificationSourcePath),
    })],
  };
  const indexEntry = {
    observer_id: definition.observerId,
    expected_unit_count: 1,
    expected_unit_ids_sha256: sha256(result.unit.unit_id),
  };
  for (const [field, [name, contents]] of Object.entries(files)) {
    const path = `observers/${definition.observerId}/${name}`;
    const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    await writeExclusive(resolve(outputRoot, path), bytes);
    indexEntry[field] = [{ path, sha256: sha256(bytes) }];
  }
  allowlist.push(await readJson(resolve(repoRoot, definition.allowlistFixture)));
  registry.push({
    observer_id: definition.observerId,
    key_id: definition.keyId,
    provider_label: definition.providerLabel,
    provider_account_fingerprint: providerSource.provider_account_fingerprint_sha256,
    instance_id_sanitized: providerSource.instance_fingerprint_sha256,
    region: definition.region,
    country_code: definition.countryCode,
    network_asns: definition.networkAsns,
    runtime_commit: definition.runtimeCommit,
    runtime_compatibility_status: "REVIEWED_COMPATIBLE",
    evidence_protocol_version: "GrantM1EvidenceProtocol@0.1.0",
    provisioned_at: definition.provisionedAt,
    independence_status: "CORROBORATED",
    evidence_refs: [`observers/${definition.observerId}/provider.json`],
  });
  indexObservers.push(indexEntry);
}

const semanticSource = resolve(sourceRoot, "shared/semantic-failure-matrix.json");
const semanticBytes = await readFile(semanticSource);
await writeExclusive(resolve(outputRoot, "shared/semantic-failure-matrix.json"), semanticBytes);
await writeExclusive(resolve(outputRoot, "allowlist.json"), allowlist);
await writeExclusive(resolve(outputRoot, "observer-registry.json"), {
  schema_version: "GrantObserverRegistry@0.3.0",
  generated_at: generatedAt,
  observers: registry,
});
await writeExclusive(resolve(outputRoot, "evidence-index.json"), {
  schema_version: "GrantM1EvidenceIndex@0.6.0",
  generated_at: generatedAt,
  semantic_failure_matrix: [{ path: "shared/semantic-failure-matrix.json", sha256: sha256(semanticBytes) }],
  observers: indexObservers,
});
process.stdout.write(`${JSON.stringify({ status: "PASS", output: outputRoot, observers: registry.length, results: indexObservers.length })}\n`);

function required(name) {
  const value = args.get(name);
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`);
  return value;
}
function parseJsonl(text) { return text.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line)); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function fileHash(path) { return sha256(await readFile(path)); }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeExclusive(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : json(value));
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
