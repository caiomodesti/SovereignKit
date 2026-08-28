import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, open, readFile, statfs } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { evaluateGrantM1CollectorHostPreflight, validateCollectorRuntimeManifest } from "./lib/grant-m1-collector-host-preflight.mjs";

const execFile = promisify(execFileCallback);
if (process.platform !== "linux") throw new Error("Collector host preflight must run on the target Linux host");
const args = parseArgs(process.argv.slice(2));
const componentId = required(args, "component-id");
const runtimeRoot = resolve(required(args, "runtime-root"));
const manifestPath = resolve(runtimeRoot, args.get("manifest") ?? "runtime-manifest.json");
const expectedRuntimeCommit = required(args, "expected-runtime-commit");
const expectedNodeVersion = args.get("expected-node-version") ?? "v22.17.0";
const service = args.get("service") ?? "sovereignkit-collector.service";
const serviceUnitPath = resolve(args.get("service-unit") ?? `/etc/systemd/system/${service}`);
const expectedServiceUnitSha256 = required(args, "expected-service-unit-sha256");
const evidencePath = resolve(required(args, "evidence-path"));
const outputPath = resolve(required(args, "output"));
const healthUrl = validateHealthUrl(args.get("health-url") ?? "http://127.0.0.1:8787/health");
const minimumFreeBytes = positiveInteger(args.get("minimum-free-bytes") ?? String(2 * 1024 * 1024 * 1024), "minimum-free-bytes");
if (!/^[A-Za-z0-9@_.:-]+\.service$/u.test(service)) throw new Error("service name is invalid");
if (!/^[a-f0-9]{64}$/u.test(expectedServiceUnitSha256)) throw new Error("expected service unit SHA-256 is invalid");

const manifest = validateCollectorRuntimeManifest(JSON.parse(await readFile(manifestPath, "utf8")));
let manifestFilesVerified = 0;
for (const entry of manifest.files) {
  const path = resolve(runtimeRoot, ...entry.path.split("/"));
  if (path !== runtimeRoot && !path.startsWith(`${runtimeRoot}${sep}`)) throw new Error("runtime manifest path escapes runtime root");
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`runtime manifest path is not a regular file: ${entry.path}`);
  const actual = createHash("sha256").update(await readFile(path)).digest("hex");
  if (actual !== entry.sha256) throw new Error(`runtime manifest SHA-256 mismatch: ${entry.path}`);
  manifestFilesVerified += 1;
}

const [clockState, serviceState, enabledState, healthSnapshot, sockets, evidence, unitBytes] = await Promise.all([
  run("timedatectl", ["show", "--property=NTPSynchronized", "--value"]),
  run("systemctl", ["is-active", service]),
  run("systemctl", ["is-enabled", service]),
  readHealth(healthUrl),
  run("ss", ["-H", "-ltn"]),
  lstat(evidencePath),
  readFile(serviceUnitPath),
]);
await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
const disk = await statfs(dirname(outputPath));
const freeBytes = Number(disk.bavail) * Number(disk.bsize);
const ownerMatches = typeof process.geteuid === "function" && evidence.uid === process.geteuid();
const port = Number(healthUrl.port || 80);
const bindings = socketBindings(sockets, port);

const record = evaluateGrantM1CollectorHostPreflight({
  componentId,
  capturedAt: new Date().toISOString(),
  runtimeCommit: manifest.source_commit,
  expectedRuntimeCommit,
  runtimeNodeVersion: process.version,
  expectedNodeVersion,
  runtimeManifestVerified: true,
  manifestFileCount: manifest.files.length,
  manifestFilesVerified,
  serviceUnitVerified: createHash("sha256").update(unitBytes).digest("hex") === expectedServiceUnitSha256,
  clockSynchronized: clockState === "yes",
  collectorServiceActive: serviceState === "active",
  collectorServiceEnabled: enabledState === "enabled",
  loopbackBindingExclusive: bindings.length === 1 && bindings[0] === `127.0.0.1:${port}`,
  freeBytes,
  minimumFreeBytes,
  evidenceMetadata: { isFile: evidence.isFile(), isSymbolicLink: evidence.isSymbolicLink(), ownerMatches, mode: evidence.mode & 0o777 },
  healthSnapshot,
});

const bytes = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
const handle = await open(outputPath, "wx", 0o600);
try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
process.stdout.write(`${JSON.stringify({ event: "GRANT_M1_COLLECTOR_HOST_PREFLIGHT_CAPTURED", componentId, output: outputPath, sha256: createHash("sha256").update(bytes).digest("hex") })}\n`);

function socketBindings(stdout, port) {
  const suffix = `:${port}`;
  return stdout.split(/\r?\n/u).filter(Boolean).map(line => line.trim().split(/\s+/u)[3]).filter(value => typeof value === "string" && value.endsWith(suffix));
}
async function run(command, commandArgs) {
  const { stdout } = await execFile(command, commandArgs, { encoding: "utf8", timeout: 10_000, windowsHide: true });
  return stdout.trim();
}
async function readHealth(url) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Collector health returned HTTP ${response.status}`);
  const text = await response.text();
  if (text.length === 0 || text.length > 64 * 1024) throw new Error("Collector health response size is invalid");
  try { return JSON.parse(text); } catch { throw new Error("Collector health response is not JSON"); }
}
function validateHealthUrl(value) {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "http:" || !loopback || url.pathname !== "/health" || url.username || url.password || url.search || url.hash) throw new Error("health-url must be an unauthenticated loopback HTTP /health endpoint");
  return url;
}
function parseArgs(values) {
  if (values.length % 2 !== 0) throw new Error("arguments must use --name value pairs");
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index], value = values[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("arguments must use --name value pairs");
    const key = name.slice(2); if (parsed.has(key)) throw new Error(`duplicate argument --${key}`); parsed.set(key, value);
  }
  const allowed = new Set(["component-id", "runtime-root", "manifest", "expected-runtime-commit", "expected-node-version", "service", "service-unit", "expected-service-unit-sha256", "evidence-path", "output", "health-url", "minimum-free-bytes"]);
  for (const key of parsed.keys()) if (!allowed.has(key)) throw new Error(`unknown argument --${key}`);
  return parsed;
}
function required(values, key) { const value = values.get(key); if (!value) throw new Error(`--${key} is required`); return value; }
function positiveInteger(value, label) { if (!/^[1-9][0-9]*$/u.test(value)) throw new Error(`--${label} must be a positive integer`); const parsed = Number(value); if (!Number.isSafeInteger(parsed)) throw new Error(`--${label} exceeds the safe integer range`); return parsed; }
