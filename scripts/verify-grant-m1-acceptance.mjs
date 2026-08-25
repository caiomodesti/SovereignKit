import { access, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const marker = process.argv.indexOf("--evidence");
const evidenceText = marker >= 0 ? process.argv[marker + 1] : undefined;
if (evidenceText === undefined) throw new Error("usage: node scripts/verify-grant-m1-acceptance.mjs --evidence <directory>");
const evidenceRoot = resolve(evidenceText);
const registry = JSON.parse(await readFile(resolveInside("observer-registry.json"), "utf8"));
const allowlist = JSON.parse(await readFile(resolveInside("allowlist.json"), "utf8"));
const evidenceIndex = JSON.parse(await readFile(resolveInside("evidence-index.json"), "utf8"));
if (registry.schema_version !== "GrantObserverRegistry@0.1.0" || !Array.isArray(registry.observers) || registry.observers.length < 3) {
  throw new Error("Milestone 1 requires at least three registry observers");
}
const observers = registry.observers;
requireUnique(observers.map(value => value.observer_id), "observer_id");
requireUnique(observers.map(value => value.key_id), "key_id");
requireUnique(observers.map(value => value.provider_label), "provider_label");
requireUnique(observers.map(value => value.provider_account_fingerprint), "provider_account_fingerprint");
requireUnique(observers.map(value => value.instance_id_sanitized), "instance_id_sanitized");
for (const observer of observers) {
  if (observer.independence_status !== "CORROBORATED") throw new Error(`${observer.observer_id} independence is not CORROBORATED`);
  if (!/^[a-f0-9]{40}$/u.test(observer.runtime_commit)) throw new Error(`${observer.observer_id} runtime_commit is invalid`);
  if (!Array.isArray(observer.evidence_refs) || observer.evidence_refs.length === 0) throw new Error(`${observer.observer_id} has no independence evidence references`);
}
if (!Array.isArray(allowlist)) throw new Error("allowlist.json must be an array");
for (const observer of observers) {
  if (!allowlist.some(entry => entry.observerId === observer.observer_id && entry.keyId === observer.key_id && typeof entry.publicKeySpkiBase64 === "string")) {
    throw new Error(`${observer.observer_id} has no matching public allowlist identity`);
  }
}
if (evidenceIndex.schema_version !== "GrantM1EvidenceIndex@0.1.0" || !Array.isArray(evidenceIndex.observers)) {
  throw new Error("evidence-index.json has an unsupported structure");
}
for (const observer of observers) {
  const entry = evidenceIndex.observers.find(value => value.observer_id === observer.observer_id);
  if (entry === undefined) throw new Error(`${observer.observer_id} has no evidence index entry`);
  for (const field of ["signed_results", "raw_observations", "health_history", "restart_evidence", "provider_evidence", "failure_matrix"]) {
    if (!Array.isArray(entry[field]) || entry[field].length === 0) throw new Error(`${observer.observer_id} is missing ${field}`);
    for (const path of entry[field]) await access(resolveInside(path));
  }
}
process.stdout.write(`${JSON.stringify({ status: "PASS", gate: "GRANT_M1_ACCEPTANCE", observers: observers.length, evidenceRoot })}\n`);

function resolveInside(path) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) throw new Error("evidence paths must be non-empty and relative");
  const resolved = resolve(evidenceRoot, path);
  const rel = relative(evidenceRoot, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`evidence path escapes root: ${path}`);
  return resolved;
}

function requireUnique(values, label) {
  if (values.some(value => typeof value !== "string" || value.length === 0) || new Set(values).size !== values.length) {
    throw new Error(`observer registry ${label} values must be non-empty and unique`);
  }
}
