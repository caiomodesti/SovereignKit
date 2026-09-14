import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "artifacts/grant-m2-official-coordinator-runtime");
const manifest = JSON.parse(await readFile(resolve(root, "runtime-manifest.json"), "utf8"));
if (manifest.schema_version !== "GrantM2OfficialCoordinatorRuntimeManifest@0.1.0" || manifest.status !== "STAGED_NOT_CONFIGURED_NOT_ACTIVATED" ||
    manifest.node_version !== "22.17.0" || manifest.contains_credentials !== false || manifest.coordinator_config_included !== false ||
    manifest.activation_performed !== false || manifest.official_window_started !== false || !/^[a-f0-9]{40}$/u.test(manifest.source_commit ?? "")) {
  throw new Error("M2 official coordinator runtime manifest is invalid");
}
const actual = []; await walk(root, actual);
const actualPaths = actual.map(path => relative(root, path).split(sep).join("/")).filter(path => path !== "runtime-manifest.json").sort();
const declared = manifest.files.map(entry => entry.path);
if (new Set(declared).size !== declared.length || JSON.stringify(declared) !== JSON.stringify(actualPaths)) throw new Error("M2 official coordinator runtime file set mismatch");
for (const entry of manifest.files) {
  if (!/^[a-f0-9]{64}$/u.test(entry.sha256) || createHash("sha256").update(await readFile(resolve(root, entry.path))).digest("hex") !== entry.sha256) throw new Error(`M2 official coordinator runtime hash mismatch: ${entry.path}`);
  if (/secret|private-key|\.env/iu.test(entry.path)) throw new Error(`forbidden credential path in M2 official coordinator runtime: ${entry.path}`);
}
const required = [
  "deploy/systemd/sovereignkit-m2-official-coordinator.service", "scripts/install-grant-m2-official-coordinator.sh",
  "scripts/run-grant-m2-official-coordinator.mjs", "scripts/run-grant-m2-official-transport-probe.mjs",
  "scripts/run-grant-m2-official-slot.mjs", "scripts/complete-grant-m2-official-slot.mjs",
  "scripts/lib/grant-m2-official-preflight.mjs", "scripts/lib/grant-m2-assignment-receipt.mjs",
];
if (required.some(path => !actualPaths.includes(path)) || actualPaths.filter(path => path.endsWith(".service")).length !== 1) throw new Error("M2 official coordinator activation inventory is invalid");
process.stdout.write(`${JSON.stringify({ status: "PASS", gate: "GRANT_M2_OFFICIAL_COORDINATOR_RUNTIME", files: actualPaths.length, sourceCommit: manifest.source_commit, coordinatorConfigIncluded: false, activationPerformed: false, officialWindowStarted: false })}\n`);
async function walk(directory, target) { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = resolve(directory, entry.name); if (entry.isDirectory()) await walk(path, target); else if (entry.isFile()) target.push(path); else throw new Error(`unsupported coordinator artifact entry ${path}`); } }
