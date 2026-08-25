import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const marker = process.argv.indexOf("--evidence");
const evidenceText = marker >= 0 ? process.argv[marker + 1] : undefined;
if (evidenceText === undefined) throw new Error("usage: node scripts/verify-grant-m1-local-readiness.mjs --evidence <directory>");
const evidenceRoot = resolve(evidenceText);
const requiredFiles = [
  "allowlist-public.json",
  "collector-accepted.jsonl",
  "collector-restart-evidence.json",
  "health-snapshots.json",
  "observation-job.json",
  "observer-delivery.jsonl",
  "raw-observations.jsonl",
  "reader-registry.json",
  "run-metadata.json",
  "spool/000000.json",
];
await Promise.all(requiredFiles.map(path => access(resolve(evidenceRoot, path))));

const metadata = JSON.parse(await readFile(resolve(evidenceRoot, "run-metadata.json"), "utf8"));
if (metadata.schema_version !== "GrantM1LocalReadinessRun@0.1.0" || metadata.terminal_state !== "FINALIZED") {
  throw new Error("local readiness metadata is not a finalized supported run");
}
if (metadata.infrastructure_independence !== false || metadata.evidence_scope !== "LOCAL_SOFTWARE_READINESS_ONLY") {
  throw new Error("local readiness evidence must explicitly deny infrastructure independence");
}
if (metadata.private_key_retained !== false || !/^[a-f0-9]{40}$/u.test(metadata.runtime_commit)) {
  throw new Error("local readiness metadata has an invalid key-retention or runtime-commit claim");
}
const registry = JSON.parse(await readFile(resolve(evidenceRoot, "reader-registry.json"), "utf8"));
if (registry.independence !== "LOGICAL_REDUNDANCY_ONLY" || registry.readers?.length !== 3) {
  throw new Error("reader registry must retain exactly three logical, non-independent readers");
}
const accepted = lines(await readFile(resolve(evidenceRoot, "collector-accepted.jsonl"), "utf8"));
const deliveries = lines(await readFile(resolve(evidenceRoot, "observer-delivery.jsonl"), "utf8"));
const raw = lines(await readFile(resolve(evidenceRoot, "raw-observations.jsonl"), "utf8"));
if (accepted.length !== 1 || deliveries.length !== 1 || raw.length < 1) throw new Error("retained logs have unexpected record counts");
const acceptedResult = JSON.parse(accepted[0]).result;
if (acceptedResult.signature !== metadata.transaction_signature || acceptedResult.terminal_state !== "FINALIZED") {
  throw new Error("accepted signed result does not match the finalized transaction metadata");
}
const restart = JSON.parse(await readFile(resolve(evidenceRoot, "collector-restart-evidence.json"), "utf8"));
if (restart.status !== "PASS" || restart.recovered_records !== 1) throw new Error("Collector replay recovery evidence is missing");
const files = await recursiveFiles(evidenceRoot);
if (files.some(path => /private|secret|keypair/iu.test(path))) throw new Error("evidence directory contains a private-key-like filename");
for (const path of files) {
  const text = await readFile(path, "utf8");
  if (text.includes("privateKeyPkcs8Base64") || text.includes("ObserverPrivateKey@")) {
    throw new Error(`evidence directory contains private observer key material: ${path}`);
  }
}
process.stdout.write(`${JSON.stringify({
  status: "PASS",
  gate: "GRANT_M1_LOCAL_READINESS",
  evidenceRoot,
  transactionSignature: metadata.transaction_signature,
  rawPolls: raw.length,
  infrastructureIndependence: false,
})}\n`);

function lines(text) {
  if (!text.endsWith("\n")) throw new Error("append-only JSONL must end with a newline");
  return text.trimEnd().split(/\r?\n/u);
}

async function recursiveFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await recursiveFiles(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}
