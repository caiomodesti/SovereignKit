import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsRoot = resolve(repositoryRoot, "artifacts");
const outputRoot = resolve(repositoryRoot, process.argv[2] ?? "artifacts/grant-m1-observer-runtime");
const trackedChanges = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repositoryRoot, encoding: "utf8" }).trim();

if (trackedChanges.length > 0) throw new Error("observer runtime staging requires a clean tracked Git tree");

if (outputRoot !== artifactsRoot && !outputRoot.startsWith(`${artifactsRoot}${sep}`)) {
  throw new Error("observer runtime output must remain inside the ignored artifacts directory");
}

const copies = [
  ["deploy/grant-pilot/observer-runtime-package.json", "package.json"],
  ["deploy/grant-pilot/observer-runtime-package-lock.json", "package-lock.json"],
  ["packages/collector/dist", "packages/collector/dist"],
  ["packages/collector/package.json", "packages/collector/package.json"],
  ["packages/probes/dist", "vendor/probes/dist"],
  ["deploy/grant-pilot/probes-observer-runtime-package.json", "vendor/probes/package.json"],
  ["packages/telemetry/dist", "vendor/telemetry/dist"],
  ["deploy/grant-pilot/telemetry-observer-runtime-package.json", "vendor/telemetry/package.json"],
  ["scripts/run-grant-m1-canary-soak.mjs", "scripts/run-grant-m1-canary-soak.mjs"],
  ["scripts/lib/grant-m1-canary-soak.mjs", "scripts/lib/grant-m1-canary-soak.mjs"],
  ["scripts/capture-grant-m1-host-preflight.mjs", "scripts/capture-grant-m1-host-preflight.mjs"],
  ["scripts/lib/grant-m1-host-preflight.mjs", "scripts/lib/grant-m1-host-preflight.mjs"],
  ["deploy/grant-pilot/systemd/sovereignkit-observer.service", "deploy/systemd/sovereignkit-observer.service"],
  ["deploy/grant-pilot/systemd/sovereignkit-observation-worker@.service", "deploy/systemd/sovereignkit-observation-worker@.service"],
  ["deploy/grant-pilot/systemd/sovereignkit-canary-soak@.service", "deploy/systemd/sovereignkit-canary-soak@.service"]
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const [source, destination] of copies) {
  const destinationPath = resolve(outputRoot, destination);
  await mkdir(dirname(destinationPath), { recursive: true });
  await cp(resolve(repositoryRoot, source), destinationPath, { recursive: true, force: true });
}

const files = [];
await walk(outputRoot, files);
files.sort((left, right) => left.localeCompare(right));
const manifest = {
  schema_version: "GrantM1ObserverRuntimeManifest@0.1.0",
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
  node_version: "22.17.0",
  dependency_install: "npm ci --omit=dev --ignore-scripts --no-audit --no-fund",
  files: await Promise.all(files.map(async path => ({
    path: relative(outputRoot, path).split(sep).join("/"),
    sha256: createHash("sha256").update(await readFile(path)).digest("hex")
  })))
};
await writeFile(resolve(outputRoot, "runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${JSON.stringify({ status: "STAGED", output: relative(repositoryRoot, outputRoot).split(sep).join("/"), source_commit: manifest.source_commit, file_count: manifest.files.length })}\n`);

async function walk(directory, target) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path, target);
    else if (entry.isFile()) target.push(path);
    else throw new Error(`unsupported runtime artifact entry ${path}`);
  }
}
