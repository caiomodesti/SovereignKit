import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importAssignmentAuthorityPrivateKey, signObservationAssignment } from "../packages/collector/dist/observation-assignment.js";
import { verifyAssignmentReceipt } from "./lib/grant-m2-assignment-receipt.mjs";
import { loadGrantM2OfficialCoordinatorConfig } from "./lib/grant-m2-official-coordinator-runtime.mjs";

const config = await loadGrantM2OfficialCoordinatorConfig(required("--config"));
const outputDirectory = resolve(required("--output-directory"));
const runtimeIdentity = await loadRuntimeIdentity();
const observerKeys = await readJson(config.observer_keys_path);
const observerAllowlist = await readJson(config.observer_allowlist_path);
const authority = importAssignmentAuthorityPrivateKey(await readJson(config.assignment_authority_private_path));
const authorityPublic = await readJson(config.assignment_authority_public_path);
const probeId = `transport-probe-${new Date().toISOString().replace(/[-:.]/gu, "").toLowerCase()}-${randomUUID()}`;
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });

const results = [];
for (const observer of config.observers) {
  const observerKeyId = observerKeys[observer.observer_id];
  const receiptAuthority = observerAllowlist.find(entry => entry.observerId === observer.observer_id && entry.keyId === observerKeyId);
  if (!receiptAuthority) throw new Error(`M2 transport probe observer key is not allowlisted: ${observer.observer_id}`);
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(issuedAt) + 300_000).toISOString();
  const assignment = signObservationAssignment({
    schemaVersion: "ObservationAssignment@0.1.0",
    assignmentId: randomUUID(),
    issuerId: authority.issuerId,
    issuerKeyId: authority.keyId,
    issuedAt,
    expiresAt,
    job: { observerId: observer.observer_id, observerKeyId, transportProbe: true, transactionSubmitted: false, workerStartAuthorized: false },
  }, authority);
  const entry = { schema_version: "GrantM2PreparedDispatch@0.1.0", transport_probe: true, transaction_submitted: false, worker_start_authorized: false, assignment };
  const entryPath = join(outputDirectory, `${observer.observer_id}-${assignment.assignmentId}-entry.json`);
  await writeOnce(entryPath, `${JSON.stringify(entry)}\n`);
  const remoteEntry = `/tmp/sovereignkit-m2-transport-probe-${assignment.assignmentId}.json`;
  const remoteAuthority = `/tmp/sovereignkit-m2-transport-probe-authority-${assignment.assignmentId}.json`;
  const remoteProbeRoot = `/var/lib/sovereignkit/m2/transport-probes/${probeId}`;
  await runScp(observer, entryPath, remoteEntry);
  await runScp(observer, config.assignment_authority_public_path, remoteAuthority);
  await runSsh(observer, ["sudo", "/usr/bin/chown", "sovereignkit:sovereignkit", "--", remoteEntry, remoteAuthority]);
  await runSsh(observer, ["sudo", "/usr/bin/chmod", "0600", "--", remoteEntry, remoteAuthority]);
  await runSsh(observer, ["sudo", "-u", "sovereignkit", "/usr/bin/test", "-r", remoteEntry, "-a", "-r", remoteAuthority]);
  await runSsh(observer, ["sudo", "/usr/bin/install", "-d", "-m", "0700", "-o", "sovereignkit", "-g", "sovereignkit", remoteProbeRoot]);
  const receivedAt = new Date().toISOString();
  const received = lastJson((await runSsh(observer, [
    "sudo", "-u", "sovereignkit", "/usr/bin/node", `${observer.runtime_root}/scripts/receive-grant-m2-assignment.mjs`,
    remoteEntry, remoteAuthority, observer.observer_private_key_path, remoteProbeRoot, receivedAt,
  ])).stdout);
  if (received?.status !== "RECEIVED") throw new Error(`M2 transport probe was not received: ${observer.observer_id}`);
  verifyAssignmentReceipt(received.receipt, entry, receiptAuthority, new Date().toISOString());
  const receiptSha256 = createHash("sha256").update(JSON.stringify(received.receipt)).digest("hex");
  results.push({ observer_id: observer.observer_id, status: "PASS", assignment_id: assignment.assignmentId, receipt_sha256: receiptSha256, transaction_submitted: false, worker_started: false });
}

const evidence = {
  schema_version: "GrantM2OfficialTransportProbe@0.1.0",
  status: "PASS",
  probe_id: probeId,
  captured_at: new Date().toISOString(),
  source_commit: runtimeIdentity.sourceCommit,
  observers: results,
  transactions_submitted: 0,
  workers_started: 0,
  official_window_started: false,
};
await writeOnce(join(outputDirectory, `${probeId}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence)}\n`);

async function runScp(observer, local, remote) {
  const result = await runProcess("/usr/bin/scp", ["-q", "-i", observer.ssh_private_key_path, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1", "-o", `UserKnownHostsFile=${observer.known_hosts_path}`, "--", local, `${observer.ssh_target}:${remote}`]);
  if (result.code !== 0) throw new Error("M2_TRANSPORT_PROBE_SCP_FAILED");
}
async function runSsh(observer, command) {
  const result = await runProcess("/usr/bin/ssh", ["-i", observer.ssh_private_key_path, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2", "-o", `UserKnownHostsFile=${observer.known_hosts_path}`, "--", observer.ssh_target, command.map(shellQuote).join(" ")]);
  if (result.code !== 0) throw new Error("M2_TRANSPORT_PROBE_SSH_FAILED");
  return result;
}
function runProcess(file, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject); child.once("close", code => resolvePromise({ code, stdout, stderr }));
  });
}
function shellQuote(value) { if (typeof value !== "string" || value.includes("\0")) throw new Error("unsafe remote argument"); return `'${value.replaceAll("'", `'"'"'`)}'`; }
function lastJson(text) { const line = text.trimEnd().split("\n").at(-1); try { return JSON.parse(line); } catch { return undefined; } }
async function readJson(path) { return JSON.parse(await readFile(resolve(path), "utf8")); }
async function writeOnce(path, text) { const handle = await open(path, "wx", 0o600); try { await handle.writeFile(text, "utf8"); await handle.sync(); } finally { await handle.close(); } }
function required(name) { const index = process.argv.indexOf(name); if (index < 0 || index + 1 >= process.argv.length) throw new Error(`${name} is required`); return process.argv[index + 1]; }

async function loadRuntimeIdentity() {
  const scriptPath = fileURLToPath(import.meta.url);
  const runtimeRoot = resolve(dirname(scriptPath), "..");
  const manifest = await readJson(join(runtimeRoot, "runtime-manifest.json"));
  const ownEntry = manifest?.files?.find(entry => entry?.path === "scripts/run-grant-m2-official-transport-probe.mjs");
  const ownSha256 = createHash("sha256").update(await readFile(scriptPath)).digest("hex");
  if (manifest?.schema_version !== "GrantM2OfficialCoordinatorRuntimeManifest@0.1.0" ||
      manifest.status !== "STAGED_NOT_CONFIGURED_NOT_ACTIVATED" || !/^[a-f0-9]{40}$/u.test(manifest.source_commit ?? "") ||
      ownEntry?.sha256 !== ownSha256 || manifest.activation_performed !== false || manifest.official_window_started !== false) {
    throw new Error("M2 transport probe runtime identity is invalid");
  }
  return { sourceCommit: manifest.source_commit };
}
