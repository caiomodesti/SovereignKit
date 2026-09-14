import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsRoot = resolve(repositoryRoot, "artifacts");
const outputRoot = resolve(repositoryRoot, process.argv[2] ?? "artifacts/grant-m2-official-coordinator-runtime");
if (process.argv.length > 3 || (outputRoot !== artifactsRoot && !outputRoot.startsWith(`${artifactsRoot}${sep}`))) {
  throw new Error("usage: stage-grant-m2-official-coordinator-runtime [output-below-artifacts]");
}
const copies = [
  ["packages/collector/dist", "packages/collector/dist"],
  ["packages/probes/dist", "packages/probes/dist"],
  ["deploy/grant-pilot/probes-observer-runtime-package.json", "packages/probes/package.json"],
  ["packages/probes/dist", "vendor/probes/dist"],
  ["deploy/grant-pilot/probes-observer-runtime-package.json", "vendor/probes/package.json"],
  ["packages/telemetry/dist", "packages/telemetry/dist"],
  ["deploy/grant-pilot/telemetry-observer-runtime-package.json", "packages/telemetry/package.json"],
  ["packages/telemetry/dist", "vendor/telemetry/dist"],
  ["deploy/grant-pilot/telemetry-observer-runtime-package.json", "vendor/telemetry/package.json"],
  ["spec/probe-result.schema.json", "spec/probe-result.schema.json"],
  ["deploy/grant-pilot/m2-resource-quota-estimate.json", "deploy/m2-resource-quota-estimate.json"],
  ["scripts/run-grant-m2-official-coordinator.mjs", "scripts/run-grant-m2-official-coordinator.mjs"],
  ["scripts/run-grant-m2-official-slot.mjs", "scripts/run-grant-m2-official-slot.mjs"],
  ["scripts/complete-grant-m2-official-slot.mjs", "scripts/complete-grant-m2-official-slot.mjs"],
  ["scripts/lib/grant-m2-official-coordinator-runtime.mjs", "scripts/lib/grant-m2-official-coordinator-runtime.mjs"],
  ["scripts/lib/grant-m2-official-coordinator.mjs", "scripts/lib/grant-m2-official-coordinator.mjs"],
  ["scripts/lib/grant-m2-official-journal.mjs", "scripts/lib/grant-m2-official-journal.mjs"],
  ["scripts/lib/grant-m2-official-run.mjs", "scripts/lib/grant-m2-official-run.mjs"],
  ["scripts/lib/grant-m2-official-schedule.mjs", "scripts/lib/grant-m2-official-schedule.mjs"],
  ["scripts/lib/grant-m2-reader-quota-proposal.mjs", "scripts/lib/grant-m2-reader-quota-proposal.mjs"],
  ["scripts/lib/grant-m2-official-slot-journal.mjs", "scripts/lib/grant-m2-official-slot-journal.mjs"],
  ["scripts/lib/grant-m2-official-slot-runner.mjs", "scripts/lib/grant-m2-official-slot-runner.mjs"],
  ["scripts/lib/grant-m2-observer-sequence-journal.mjs", "scripts/lib/grant-m2-observer-sequence-journal.mjs"],
  ["scripts/lib/grant-m2-rpc-budget.mjs", "scripts/lib/grant-m2-rpc-budget.mjs"],
  ["scripts/lib/grant-m2-rpc-budget-journal.mjs", "scripts/lib/grant-m2-rpc-budget-journal.mjs"],
  ["scripts/lib/grant-m2-official-reconciliation.mjs", "scripts/lib/grant-m2-official-reconciliation.mjs"],
  ["scripts/lib/grant-m2-official-evidence-store.mjs", "scripts/lib/grant-m2-official-evidence-store.mjs"],
  ["deploy/grant-pilot/systemd/sovereignkit-m2-official-coordinator.service", "deploy/systemd/sovereignkit-m2-official-coordinator.service"],
  ["scripts/install-grant-m2-official-coordinator.sh", "scripts/install-grant-m2-official-coordinator.sh"],
];
const sources = [...new Set([...copies.map(([source]) => source), "deploy/grant-pilot/coordinator-runtime-package-lock.json"] )];
const changes = execFileSync("git", ["status", "--porcelain", "--untracked-files=no", "--", ...sources], { cwd: repositoryRoot, encoding: "utf8" }).trim();
if (changes.length > 0) throw new Error("M2 official coordinator staging requires packaged sources to match HEAD");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const [source, destination] of copies) {
  const target = resolve(outputRoot, destination);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(repositoryRoot, source), target, { recursive: true, force: true });
}
const runtimePackage = {
  name: "sovereignkit-grant-m2-official-coordinator-runtime", version: "0.1.0", private: true, type: "module",
  engines: { node: "22.17.0" }, dependencies: {
    "@sovereignkit/probes": "file:vendor/probes", "@sovereignkit/telemetry": "file:vendor/telemetry",
    "@solana/kit": "7.0.0", ajv: "8.20.0", "ajv-formats": "3.0.1",
  },
};
await writeFile(resolve(outputRoot, "package.json"), `${JSON.stringify(runtimePackage, null, 2)}\n`, { flag: "wx" });
const lock = JSON.parse(await readFile(resolve(repositoryRoot, "deploy/grant-pilot/coordinator-runtime-package-lock.json"), "utf8"));
lock.name = runtimePackage.name; lock.version = runtimePackage.version;
lock.packages[""].name = runtimePackage.name; lock.packages[""].version = runtimePackage.version;
await writeFile(resolve(outputRoot, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`, { flag: "wx" });
const files = [];
await walk(outputRoot, files); files.sort((left, right) => left.localeCompare(right));
const manifest = {
  schema_version: "GrantM2OfficialCoordinatorRuntimeManifest@0.1.0", status: "STAGED_NOT_CONFIGURED_NOT_ACTIVATED",
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
  node_version: "22.17.0", dependency_install: "npm ci --omit=dev --ignore-scripts --no-audit --no-fund",
  contains_credentials: false, coordinator_config_included: false, activation_performed: false, official_window_started: false,
  files: await Promise.all(files.map(async path => ({ path: relative(outputRoot, path).split(sep).join("/"), sha256: createHash("sha256").update(await readFile(path)).digest("hex") }))),
};
await writeFile(resolve(outputRoot, "runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: manifest.status, output: relative(repositoryRoot, outputRoot).split(sep).join("/"), source_commit: manifest.source_commit, file_count: manifest.files.length })}\n`);
async function walk(directory, target) { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = resolve(directory, entry.name); if (entry.isDirectory()) await walk(path, target); else if (entry.isFile()) target.push(path); else throw new Error(`unsupported coordinator artifact entry ${path}`); } }
