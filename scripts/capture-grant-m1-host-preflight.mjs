import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, open, readFile, statfs } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { evaluateGrantM1HostPreflight, validateObserverRuntimeManifest } from "./lib/grant-m1-host-preflight.mjs";

const execFile = promisify(execFileCallback);
const args = parseArgs(process.argv.slice(2));

if (process.platform !== "linux") throw new Error("grant M1 host preflight must run on the target Linux observer host");

const observerId = required(args, "observer-id");
const keyPath = resolve(required(args, "key-path"));
const runtimeRoot = resolve(required(args, "runtime-root"));
const service = args.get("service") ?? "sovereignkit-observer.service";
const manifestPath = resolve(runtimeRoot, args.get("manifest") ?? "runtime-manifest.json");
const serviceUnitPath = resolve(args.get("service-unit-path") ?? `/etc/systemd/system/${service}`);
const expectedServiceUnitPath = resolve(runtimeRoot, args.get("expected-service-unit") ?? "deploy/systemd/sovereignkit-observer.service");
const outputPath = resolve(required(args, "output"));
const healthUrl = validateHealthUrl(args.get("health-url") ?? "http://127.0.0.1:8790/ready");
const minimumFreeBytes = parsePositiveInteger(args.get("minimum-free-bytes") ?? String(2 * 1024 * 1024 * 1024), "minimum-free-bytes");

if (!/^[A-Za-z0-9@_.:-]+\.service$/u.test(service)) throw new Error("service name is invalid");

const manifestMetadata = await lstat(manifestPath);
if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink()) throw new Error("runtime manifest must be a regular non-symlink file");
const manifest = validateObserverRuntimeManifest(JSON.parse(await readFile(manifestPath, "utf8")));
const expectedRuntimeCommit = manifest.source_commit;
const expectedNodeVersion = `v${manifest.node_version}`;
const [key, verifiedFiles, clockState, serviceState, serviceEnabled, healthSnapshot, bindings, serviceUnitBytes, expectedServiceUnitBytes] = await Promise.all([
  lstat(keyPath),
  verifyManifestFiles(runtimeRoot, manifest.files),
  run("timedatectl", ["show", "--property=NTPSynchronized", "--value"]),
  run("systemctl", ["is-active", service]),
  run("systemctl", ["is-enabled", service]),
  readHealth(healthUrl),
  run("ss", ["-H", "-ltn", "sport", "=", ":8790"]),
  readFile(serviceUnitPath),
  readFile(expectedServiceUnitPath),
]);

await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
const disk = await statfs(dirname(outputPath));
const freeBytes = Number(disk.bavail) * Number(disk.bsize);
const ownerMatches = typeof process.geteuid === "function" && key.uid === process.geteuid();
const record = evaluateGrantM1HostPreflight({
  observerId,
  capturedAt: new Date().toISOString(),
  runtimeCommit: manifest.source_commit,
  expectedRuntimeCommit,
  runtimeNodeVersion: process.version,
  expectedNodeVersion,
  runtimeManifestVerified: true,
  manifestFileCount: manifest.files.length,
  manifestFilesVerified: verifiedFiles,
  serviceUnitVerified: sha256(serviceUnitBytes) === sha256(expectedServiceUnitBytes),
  clockSynchronized: clockState.trim() === "yes",
  observerServiceActive: serviceState.trim() === "active",
  observerServiceEnabled: serviceEnabled.trim() === "enabled",
  loopbackBindingExclusive: validateLoopbackBinding(bindings),
  freeBytes,
  minimumFreeBytes,
  keyMetadata: { isFile: key.isFile(), isSymbolicLink: key.isSymbolicLink(), ownerMatches, mode: key.mode & 0o777 },
  healthSnapshot,
});

const bytes = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
const handle = await open(outputPath, "wx", 0o600);
try {
  await handle.writeFile(bytes);
  await handle.sync();
} finally {
  await handle.close();
}

process.stdout.write(`${JSON.stringify({ event: "GRANT_M1_HOST_PREFLIGHT_CAPTURED", observerId, output: outputPath, sha256: createHash("sha256").update(bytes).digest("hex") })}\n`);

async function run(command, commandArgs) {
  const { stdout } = await execFile(command, commandArgs, { encoding: "utf8", timeout: 10_000, windowsHide: true });
  return stdout.trim();
}

async function readHealth(url) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`observer readiness returned HTTP ${response.status}`);
  const text = await response.text();
  if (text.length === 0 || text.length > 64 * 1024) throw new Error("observer readiness response size is invalid");
  try { return JSON.parse(text); } catch { throw new Error("observer readiness response is not JSON"); }
}

function validateHealthUrl(value) {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "http:" || !loopback || url.pathname !== "/ready" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Error("health-url must be an unauthenticated loopback HTTP /ready endpoint");
  }
  return url;
}

function parseArgs(values) {
  if (values.length % 2 !== 0) throw new Error("arguments must use --name value pairs");
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("arguments must use --name value pairs");
    const key = name.slice(2);
    if (parsed.has(key)) throw new Error(`duplicate argument --${key}`);
    parsed.set(key, value);
  }
  const allowed = new Set(["observer-id", "key-path", "runtime-root", "manifest", "service-unit-path", "expected-service-unit", "output", "service", "health-url", "minimum-free-bytes"]);
  for (const key of parsed.keys()) if (!allowed.has(key)) throw new Error(`unknown argument --${key}`);
  return parsed;
}

async function verifyManifestFiles(root, files) {
  let verified = 0;
  for (const entry of files) {
    const path = resolve(root, ...entry.path.split("/"));
    if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error("manifest file escaped runtime root");
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`runtime file is not a regular non-symlink file: ${entry.path}`);
    if (sha256(await readFile(path)) !== entry.sha256) throw new Error(`runtime file hash mismatch: ${entry.path}`);
    verified += 1;
  }
  return verified;
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function validateLoopbackBinding(output) {
  const lines = output.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  return lines.length > 0 && lines.every(line => /(?:^|\s)(?:127\.0\.0\.1|\[::1\]):8790(?:\s|$)/u.test(line));
}

function required(values, key) {
  const value = values.get(key);
  if (value === undefined || value.length === 0) throw new Error(`--${key} is required`);
  return value;
}

function parsePositiveInteger(value, label) {
  if (!/^[1-9][0-9]*$/u.test(value)) throw new Error(`--${label} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${label} exceeds the safe integer range`);
  return parsed;
}
