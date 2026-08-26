import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, open, statfs } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { evaluateGrantM1HostPreflight } from "./lib/grant-m1-host-preflight.mjs";

const execFile = promisify(execFileCallback);
const args = parseArgs(process.argv.slice(2));

if (process.platform !== "linux") throw new Error("grant M1 host preflight must run on the target Linux observer host");

const observerId = required(args, "observer-id");
const keyPath = resolve(required(args, "key-path"));
const runtimeRoot = resolve(required(args, "runtime-root"));
const expectedRuntimeCommit = required(args, "expected-runtime-commit");
const expectedNodeVersion = args.get("expected-node-version") ?? "v22.17.0";
const outputPath = resolve(required(args, "output"));
const service = args.get("service") ?? "sovereignkit-observer.service";
const healthUrl = validateHealthUrl(args.get("health-url") ?? "http://127.0.0.1:8790/ready");
const minimumFreeBytes = parsePositiveInteger(args.get("minimum-free-bytes") ?? String(2 * 1024 * 1024 * 1024), "minimum-free-bytes");

if (!/^[A-Za-z0-9@_.:-]+\.service$/u.test(service)) throw new Error("service name is invalid");

const [key, runtimeCommit, runtimeStatus, clockState, serviceState, healthSnapshot] = await Promise.all([
  lstat(keyPath),
  run("git", ["-C", runtimeRoot, "rev-parse", "HEAD"]),
  run("git", ["-C", runtimeRoot, "status", "--porcelain", "--untracked-files=no"]),
  run("timedatectl", ["show", "--property=NTPSynchronized", "--value"]),
  run("systemctl", ["is-active", service]),
  readHealth(healthUrl),
]);

await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
const disk = await statfs(dirname(outputPath));
const freeBytes = Number(disk.bavail) * Number(disk.bsize);
const ownerMatches = typeof process.geteuid === "function" && key.uid === process.geteuid();
const record = evaluateGrantM1HostPreflight({
  observerId,
  capturedAt: new Date().toISOString(),
  runtimeCommit: runtimeCommit.trim(),
  expectedRuntimeCommit,
  runtimeNodeVersion: process.version,
  expectedNodeVersion,
  runtimeTreeClean: runtimeStatus.length === 0,
  clockSynchronized: clockState.trim() === "yes",
  observerServiceActive: serviceState.trim() === "active",
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
  const allowed = new Set(["observer-id", "key-path", "runtime-root", "expected-runtime-commit", "expected-node-version", "output", "service", "health-url", "minimum-free-bytes"]);
  for (const key of parsed.keys()) if (!allowed.has(key)) throw new Error(`unknown argument --${key}`);
  return parsed;
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
