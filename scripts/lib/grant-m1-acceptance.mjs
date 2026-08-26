import { createHash, createPublicKey, verify } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const EVIDENCE_FIELDS = ["assignment_provenance", "signed_results", "raw_observations", "health_history", "restart_evidence", "provider_evidence", "failure_matrix"];
const PRIVATE_MARKERS = ["privateKeyPkcs8Base64", "ObserverPrivateKey@", "AssignmentAuthorityPrivateKey@", "BEGIN PRIVATE KEY"];

export async function verifyGrantM1Acceptance(evidenceRootText) {
  const evidenceRoot = resolve(evidenceRootText);
  const evidenceRootReal = await realpath(evidenceRoot);
  const resolveInside = path => resolveEvidencePath(evidenceRoot, path);
  const registry = await readJson(resolveInside("observer-registry.json"), "observer registry", evidenceRootReal);
  const allowlist = await readJson(resolveInside("allowlist.json"), "allowlist", evidenceRootReal);
  const assignmentAuthorities = await readJson(resolveInside("assignment-authorities.json"), "assignment authority allowlist", evidenceRootReal);
  const evidenceIndex = await readJson(resolveInside("evidence-index.json"), "evidence index", evidenceRootReal);

  if (registry.schema_version !== "GrantObserverRegistry@0.1.0" || !Array.isArray(registry.observers) || registry.observers.length < 3) throw new Error("Milestone 1 requires at least three registry observers");
  const observers = registry.observers;
  requireUnique(observers.map(value => value.observer_id), "observer_id");
  requireUnique(observers.map(value => value.key_id), "key_id");
  requireUnique(observers.map(value => normalized(value.provider_label)), "provider_label");
  requireUnique(observers.map(value => value.provider_account_fingerprint), "provider_account_fingerprint");
  requireUnique(observers.map(value => value.instance_id_sanitized), "instance_id_sanitized");
  requireUnique(observers.map(value => `${normalized(value.provider_label)}\u001f${normalized(value.region)}`), "provider/region");
  const runtimeCommits = new Set();
  for (const observer of observers) {
    requireIdentifier(observer.observer_id, "observer_id");
    requireIdentifier(observer.key_id, `${observer.observer_id} key_id`);
    if (observer.independence_status !== "CORROBORATED") throw new Error(`${observer.observer_id} independence is not CORROBORATED`);
    if (!/^[a-f0-9]{40}$/u.test(observer.runtime_commit)) throw new Error(`${observer.observer_id} runtime_commit is invalid`);
    runtimeCommits.add(observer.runtime_commit);
    if (!Number.isSafeInteger(observer.network_asn) || observer.network_asn <= 0) throw new Error(`${observer.observer_id} network_asn must be corroborated and non-zero`);
    if (!/^[A-Z]{2}$/u.test(observer.country_code)) throw new Error(`${observer.observer_id} country_code is invalid`);
    requireSanitizedFingerprint(observer.provider_account_fingerprint, `${observer.observer_id} provider_account_fingerprint`);
    requireSanitizedFingerprint(observer.instance_id_sanitized, `${observer.observer_id} instance_id_sanitized`);
    rejectPlaceholder(observer.provider_label, `${observer.observer_id} provider_label`);
    rejectPlaceholder(observer.region, `${observer.observer_id} region`);
    if (!Array.isArray(observer.evidence_refs) || observer.evidence_refs.length === 0) throw new Error(`${observer.observer_id} has no independence evidence references`);
  }
  if (runtimeCommits.size !== 1) throw new Error("all observers must run the same reviewed runtime_commit");

  if (!Array.isArray(allowlist) || allowlist.length !== observers.length) throw new Error("allowlist.json must contain exactly one identity for every registry observer");
  requireUnique(allowlist.map(entry => `${entry.observerId}\u001f${entry.keyId}`), "allowlist observer/key");
  const allowlistByIdentity = new Map(allowlist.map(entry => [`${entry.observerId}\u001f${entry.keyId}`, validateAllowlistEntry(entry)]));
  for (const observer of observers) if (!allowlistByIdentity.has(`${observer.observer_id}\u001f${observer.key_id}`)) throw new Error(`${observer.observer_id} has no matching public allowlist identity`);

  if (!Array.isArray(assignmentAuthorities) || assignmentAuthorities.length === 0) throw new Error("assignment-authorities.json must contain at least one public authority");
  requireUnique(assignmentAuthorities.map(entry => `${entry.issuerId}\u001f${entry.keyId}`), "assignment authority issuer/key");
  const assignmentAuthoritiesByIdentity = new Map(assignmentAuthorities.map(entry => [`${entry.issuerId}\u001f${entry.keyId}`, validateAssignmentAuthorityEntry(entry)]));

  if (evidenceIndex.schema_version !== "GrantM1EvidenceIndex@0.3.0" || !Array.isArray(evidenceIndex.observers) || evidenceIndex.observers.length !== observers.length) throw new Error("evidence-index.json must use GrantM1EvidenceIndex@0.3.0 with exactly one entry per observer");
  requireUnique(evidenceIndex.observers.map(value => value.observer_id), "evidence index observer_id");
  const seenPaths = new Set();
  let signedResultCount = 0;
  let rawPollCount = 0;
  let assignmentCount = 0;
  for (const observer of observers) {
    const entry = evidenceIndex.observers.find(value => value.observer_id === observer.observer_id);
    if (entry === undefined) throw new Error(`${observer.observer_id} has no evidence index entry`);
    const expectedPrefix = `observers/${observer.observer_id}/`;
    const evidenceByField = new Map();
    for (const field of EVIDENCE_FIELDS) {
      if (!Array.isArray(entry[field]) || entry[field].length === 0) throw new Error(`${observer.observer_id} is missing ${field}`);
      const artifacts = [];
      for (const reference of entry[field]) {
        validateReference(reference, observer.observer_id, field, expectedPrefix, seenPaths);
        const bytes = await readNonEmpty(resolveInside(reference.path), reference.path, evidenceRootReal);
        if (sha256Hex(bytes) !== reference.sha256) throw new Error(`${reference.path} SHA-256 does not match evidence-index.json`);
        rejectPrivateMaterial(bytes, reference.path);
        artifacts.push({ reference, records: parseEvidenceRecords(bytes, reference.path) });
      }
      evidenceByField.set(field, artifacts);
    }
    const providerPaths = new Set(entry.provider_evidence.map(reference => reference.path));
    for (const reference of observer.evidence_refs) if (typeof reference !== "string" || !providerPaths.has(reference)) throw new Error(`${observer.observer_id} registry evidence_refs must point to indexed provider_evidence`);
    const allowlistEntry = allowlistByIdentity.get(`${observer.observer_id}\u001f${observer.key_id}`);
    const signedResults = evidenceByField.get("signed_results").flatMap(artifact => artifact.records.map(record => unwrapSignedResult(record, artifact.reference.path)));
    if (!signedResults.some(result => result.terminal_state === "FINALIZED")) throw new Error(`${observer.observer_id} has no FINALIZED signed result`);
    const resultSignatures = new Set();
    for (const result of signedResults) {
      validateSignedResult(result, observer, allowlistEntry);
      resultSignatures.add(result.signature);
      signedResultCount += 1;
    }
    const assignments = evidenceByField.get("assignment_provenance").flatMap(artifact => artifact.records);
    const assignmentsByResult = new Map();
    for (const assignment of assignments) {
      const authority = assignmentAuthoritiesByIdentity.get(`${assignment?.issuerId}\u001f${assignment?.issuerKeyId}`);
      if (authority === undefined) throw new Error(`${observer.observer_id} assignment authority is not allowlisted`);
      validateAssignment(assignment, observer, authority);
      if (assignmentsByResult.has(assignment.job.resultId)) throw new Error(`${observer.observer_id} has duplicate assignments for result ${assignment.job.resultId}`);
      assignmentsByResult.set(assignment.job.resultId, assignment);
      assignmentCount += 1;
    }
    for (const result of signedResults) {
      const assignment = assignmentsByResult.get(result.result_id);
      if (assignment === undefined || !assignmentMatchesResult(assignment, result)) throw new Error(`${observer.observer_id} signed result lacks matching assignment provenance`);
      const observedAt = Date.parse(result.observer_wall_time);
      if (observedAt < Date.parse(assignment.issuedAt) || observedAt > Date.parse(assignment.expiresAt)) throw new Error(`${observer.observer_id} result was produced outside its assignment window`);
    }
    const rawRecords = evidenceByField.get("raw_observations").flatMap(artifact => artifact.records);
    for (const poll of rawRecords) {
      const assignment = assignments.find(value => value.assignmentId === poll?.assignment_id && value.payloadHash === poll?.assignment_payload_hash);
      if (poll?.schema_version !== "RawObservationPoll@0.2.0" || assignment === undefined || poll.observer_id !== observer.observer_id || !resultSignatures.has(poll.signature) || assignment.job.signature !== poll.signature) throw new Error(`${observer.observer_id} raw observation is not correlated to an indexed signed assignment and result`);
      if (!Array.isArray(poll.claims) || new Set(poll.claims.map(claim => claim?.reader_id)).size !== 3) throw new Error(`${observer.observer_id} raw observation must contain three unique logical readers`);
      rawPollCount += 1;
    }
    if (rawRecords.length === 0) throw new Error(`${observer.observer_id} has no raw observation polls`);
    validateObserverScopedRecords(evidenceByField, observer);
  }
  return { status: "PASS", gate: "GRANT_M1_ACCEPTANCE", observers: observers.length, runtimeCommit: [...runtimeCommits][0], assignments: assignmentCount, signedResults: signedResultCount, rawPolls: rawPollCount, evidenceRoot };
}

function validateAssignment(assignment, observer, authority) {
  if (assignment?.schemaVersion !== "ObservationAssignment@0.1.0" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(assignment.assignmentId) || assignment.job?.observerId !== observer.observer_id || assignment.job?.observerKeyId !== observer.key_id) throw new Error(`${observer.observer_id} assignment structure or observer identity is invalid`);
  if (assignment.job.schemaVersion !== "ObservationJob@0.1.0" || !Number.isSafeInteger(assignment.job.observerSequence) || assignment.job.observerSequence < 0 ||
      !Number.isSafeInteger(assignment.job.pollIntervalMs) || assignment.job.pollIntervalMs < 100 || assignment.job.pollIntervalMs > 30_000 ||
      !Number.isSafeInteger(assignment.job.observationDeadlineMs) || assignment.job.observationDeadlineMs < assignment.job.pollIntervalMs || assignment.job.observationDeadlineMs > 300_000 ||
      !Number.isSafeInteger(assignment.job.readerRequestTimeoutMs) || assignment.job.readerRequestTimeoutMs < 100 || assignment.job.readerRequestTimeoutMs > 30_000) {
    throw new Error(`${observer.observer_id} assignment job contract is invalid`);
  }
  const { payloadHash, issuerSignature, ...unsigned } = assignment;
  if (!/^[a-f0-9]{64}$/u.test(payloadHash) || typeof issuerSignature !== "string" || sha256Hex(Buffer.from(canonicalJson(unsigned))) !== payloadHash) throw new Error(`${observer.observer_id} assignment payload hash is invalid`);
  const issuedAt = Date.parse(assignment.issuedAt);
  const expiresAt = Date.parse(assignment.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt || expiresAt - issuedAt > 86_400_000 || issuedAt < authority.validFromMs || issuedAt > authority.validUntilMs) throw new Error(`${observer.observer_id} assignment validity is invalid`);
  let publicKey;
  try { publicKey = createPublicKey({ key: Buffer.from(authority.publicKeySpkiBase64, "base64"), type: "spki", format: "der" }); }
  catch { throw new Error(`${observer.observer_id} assignment authority public key encoding is invalid`); }
  if (!verify(null, Buffer.from(canonicalJson({ ...unsigned, payloadHash })), publicKey, Buffer.from(issuerSignature, "base64url"))) throw new Error(`${observer.observer_id} assignment signature is invalid`);
}

function assignmentMatchesResult(assignment, result) {
  const job = assignment.job;
  return job.resultId === result.result_id && job.observerId === result.observer_id && job.observerKeyId === result.observer_key_id &&
    job.observerSequence === result.observer_sequence && job.experimentDefinitionHash === result.experiment_definition_hash &&
    job.signature === result.signature && canonicalJson(job.unit) === canonicalJson(result.unit) && canonicalJson(job.submission) === canonicalJson(result.submission);
}

function validateObserverScopedRecords(evidenceByField, observer) {
  for (const field of ["health_history", "restart_evidence", "provider_evidence", "failure_matrix"]) {
    const records = evidenceByField.get(field).flatMap(artifact => artifact.records);
    if (records.some(record => record?.observer_id !== observer.observer_id)) throw new Error(`${observer.observer_id} ${field} contains unscoped or mismatched records`);
    if (field === "provider_evidence" && !records.some(record => record.provider_label === observer.provider_label && record.region === observer.region && record.network_asn === observer.network_asn && record.corroborated === true)) throw new Error(`${observer.observer_id} provider evidence does not corroborate the registry`);
    if (field === "health_history" && !records.some(record => record.ready === true && record.clock_synchronized === true && record.key_permissions_verified === true)) throw new Error(`${observer.observer_id} health evidence lacks ready, synchronized-clock, and key-permission proof`);
    if (field === "restart_evidence" && !records.some(record => record.restart_succeeded === true && Number.isSafeInteger(record.recovered_records) && record.recovered_records >= 1)) throw new Error(`${observer.observer_id} restart evidence does not prove durable recovery`);
    if (field === "failure_matrix") {
      const required = ["HEALTHY", "DELAYED", "ONE_READER_UNAVAILABLE", "TWO_READERS_UNAVAILABLE", "DISAGREEMENT"];
      if (!records.some(record => required.every(name => record.cases?.[name] === "PASS"))) throw new Error(`${observer.observer_id} failure matrix is incomplete`);
    }
  }
}

function validateSignedResult(result, observer, allowlistEntry) {
  if (result?.schema_version !== "0.1.0" || result.observer_id !== observer.observer_id || result.observer_key_id !== observer.key_id || result.unit?.observer_id !== observer.observer_id) throw new Error(`${observer.observer_id} signed result identity is invalid`);
  validateSignedResultStructure(result, observer.observer_id);
  if (!/^[a-f0-9]{64}$/u.test(result.payload_hash) || typeof result.observer_signature !== "string") throw new Error(`${observer.observer_id} signed result cryptographic fields are invalid`);
  const { payload_hash: payloadHash, observer_signature: signature, ...unsigned } = result;
  if (sha256Hex(Buffer.from(canonicalJson(unsigned))) !== payloadHash) throw new Error(`${observer.observer_id} signed result payload hash is invalid`);
  const signable = canonicalJson({ ...unsigned, payload_hash: payloadHash });
  let publicKey;
  try { publicKey = createPublicKey({ key: Buffer.from(allowlistEntry.publicKeySpkiBase64, "base64"), type: "spki", format: "der" }); }
  catch { throw new Error(`${observer.observer_id} allowlist public key encoding is invalid`); }
  if (!verify(null, Buffer.from(signable), publicKey, Buffer.from(signature, "base64url"))) throw new Error(`${observer.observer_id} signed result signature is invalid`);
  const observedAt = Date.parse(result.observer_wall_time);
  if (!Number.isFinite(observedAt) || observedAt < allowlistEntry.validFromMs || observedAt > allowlistEntry.validUntilMs) throw new Error(`${observer.observer_id} signed result is outside the allowlist validity interval`);
}

function validateSignedResultStructure(result, observerId) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(result.result_id) ||
      !/^[a-f0-9]{64}$/u.test(result.idempotency_key) || !/^[a-f0-9]{64}$/u.test(result.experiment_definition_hash) ||
      !/^[a-f0-9]{64}$/u.test(result.unit?.unit_id) || typeof result.signature !== "string" || result.signature.length < 80 || result.signature.length > 90) {
    throw new Error(`${observerId} signed result identifiers are invalid`);
  }
  if (!Number.isSafeInteger(result.observer_sequence) || result.observer_sequence < 0 || result.submission?.attempt_number !== 1) throw new Error(`${observerId} signed result sequence or submission attempt is invalid`);
  const expectedUnitId = sha256Hex(Buffer.from([
    result.unit.experiment_id, result.unit.experiment_version, result.unit.phase, result.unit.observer_id,
    result.unit.route_id, result.unit.transaction_class, String(result.unit.probe_index),
  ].join("\u001f")));
  if (result.unit.unit_id !== expectedUnitId || result.idempotency_key !== sha256Hex(Buffer.from(`${result.observer_id}\u001f${result.unit.unit_id}`))) throw new Error(`${observerId} signed result unit or idempotency key is invalid`);
  if (!Array.isArray(result.reader_claims) || new Set(result.reader_claims.map(claim => claim?.reader_id)).size !== 3) throw new Error(`${observerId} signed result must contain three unique reader claims`);
  if (!Array.isArray(result.quorum_decisions) || result.quorum_decisions.length === 0) throw new Error(`${observerId} signed result has no quorum decision`);
  const claims = new Map(result.reader_claims.map(claim => [claim.claim_id, claim]));
  const terminal = result.quorum_decisions.at(-1);
  if (terminal?.decision_type !== result.terminal_state || terminal.quorum_rule_version !== "ObservationQuorum@0.1.0" || !Array.isArray(terminal.supporting_claim_ids)) throw new Error(`${observerId} signed result terminal quorum decision is invalid`);
  const supportingReaders = new Set(terminal.supporting_claim_ids.map(id => claims.get(id)?.reader_id).filter(Boolean));
  if (supportingReaders.size < 2 || terminal.supporting_claim_ids.some(id => !claims.has(id))) throw new Error(`${observerId} signed result does not contain a valid 2/3 quorum`);
}

function validateAllowlistEntry(entry) {
  requireIdentifier(entry?.observerId, "allowlist observerId");
  requireIdentifier(entry?.keyId, "allowlist keyId");
  if (typeof entry.publicKeySpkiBase64 !== "string" || entry.publicKeySpkiBase64.length < 32) throw new Error(`${entry.observerId} allowlist public key is invalid`);
  const validFromMs = Date.parse(entry.validFrom);
  const validUntilMs = entry.validUntil === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.validUntil);
  if (!Number.isFinite(validFromMs) || Number.isNaN(validUntilMs) || validUntilMs <= validFromMs) throw new Error(`${entry.observerId} allowlist validity interval is invalid`);
  return { ...entry, validFromMs, validUntilMs };
}

function validateAssignmentAuthorityEntry(entry) {
  requireIdentifier(entry?.issuerId, "assignment authority issuerId");
  requireIdentifier(entry?.keyId, "assignment authority keyId");
  if (typeof entry.publicKeySpkiBase64 !== "string" || entry.publicKeySpkiBase64.length < 32) throw new Error(`${entry.issuerId} assignment authority public key is invalid`);
  const validFromMs = Date.parse(entry.validFrom);
  const validUntilMs = entry.validUntil === undefined ? Number.POSITIVE_INFINITY : Date.parse(entry.validUntil);
  if (!Number.isFinite(validFromMs) || Number.isNaN(validUntilMs) || validUntilMs <= validFromMs) throw new Error(`${entry.issuerId} assignment authority validity interval is invalid`);
  return { ...entry, validFromMs, validUntilMs };
}

function validateReference(reference, observerId, field, expectedPrefix, seenPaths) {
  if (reference === null || typeof reference !== "object" || Array.isArray(reference) || typeof reference.path !== "string" || !/^[a-f0-9]{64}$/u.test(reference.sha256)) throw new Error(`${observerId} ${field} references must contain path and lowercase SHA-256`);
  const normalizedPath = reference.path.replaceAll("\\", "/");
  if (normalizedPath !== reference.path || !normalizedPath.startsWith(expectedPrefix)) throw new Error(`${observerId} ${field} path must be scoped under ${expectedPrefix}`);
  if (seenPaths.has(normalizedPath)) throw new Error(`evidence path is reused across entries: ${normalizedPath}`);
  seenPaths.add(normalizedPath);
}

function parseEvidenceRecords(bytes, path) {
  const text = bytes.toString("utf8");
  if (path.endsWith(".jsonl")) return text.trimEnd().split(/\r?\n/u).map((line, index) => parseJson(line, `${path} record ${index}`));
  const parsed = parseJson(text, path);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function unwrapSignedResult(record, path) {
  const result = record?.result ?? record;
  if (result === null || typeof result !== "object" || Array.isArray(result)) throw new Error(`${path} does not contain a signed ProbeResult`);
  return result;
}

function canonicalJson(value) { return JSON.stringify(normalizeCanonical(value)); }
function normalizeCanonical(value) {
  if (Array.isArray(value)) return value.map(normalizeCanonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, normalizeCanonical(entry)]));
  return value;
}

function resolveEvidencePath(root, path) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) throw new Error("evidence paths must be non-empty and relative");
  const resolved = resolve(root, path);
  const rel = relative(root, resolved);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error(`evidence path escapes root: ${path}`);
  return resolved;
}

async function readJson(path, label, evidenceRootReal) { const bytes = await readNonEmpty(path, label, evidenceRootReal); rejectPrivateMaterial(bytes, label); return parseJson(bytes.toString("utf8"), label); }
async function readNonEmpty(path, label, evidenceRootReal) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  const actual = await realpath(path);
  const rel = relative(evidenceRootReal, actual);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error(`${label} resolves outside the evidence root`);
  const bytes = await readFile(actual);
  if (bytes.length === 0) throw new Error(`${label} is empty`);
  if (bytes.length > 16 * 1024 * 1024) throw new Error(`${label} exceeds the 16 MiB evidence limit`);
  return bytes;
}
function parseJson(text, label) { try { return JSON.parse(text); } catch { throw new Error(`${label} is not valid JSON`); } }
function rejectPrivateMaterial(bytes, label) { const text = bytes.toString("utf8"); if (PRIVATE_MARKERS.some(marker => text.includes(marker))) throw new Error(`${label} contains forbidden private key material`); }
function requireUnique(values, label) { if (values.some(value => typeof value !== "string" || value.length === 0) || new Set(values).size !== values.length) throw new Error(`${label} values must be non-empty and unique`); }
function requireIdentifier(value, label) { if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/u.test(value)) throw new Error(`${label} is invalid`); }
function requireSanitizedFingerprint(value, label) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} must be a sanitized SHA-256 fingerprint`); }
function rejectPlaceholder(value, label) { if (typeof value !== "string" || value.length === 0 || /replace|redacted|example|invalid|unknown|tbd/iu.test(value)) throw new Error(`${label} contains a placeholder`); }
function normalized(value) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
function sha256Hex(value) { return createHash("sha256").update(value).digest("hex"); }
