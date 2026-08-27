import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { createGrantM1CanarySample, evaluateGrantM1CanarySoak, validateLoopbackReadyUrl } from "./lib/grant-m1-canary-soak.mjs";

if (process.platform !== "linux") throw new Error("grant M1 canary soak must run on the target Linux observer host");
const args = parseArgs(process.argv.slice(2));
const observerId = required(args, "observer-id");
const healthUrl = validateLoopbackReadyUrl(args.get("health-url") ?? "http://127.0.0.1:8790/ready");
const durationSeconds = integer(args.get("duration-seconds") ?? "86400", "duration-seconds", 86_400, 604_800);
const intervalSeconds = integer(args.get("interval-seconds") ?? "60", "interval-seconds", 15, 300);
const requestTimeoutMs = integer(args.get("request-timeout-ms") ?? "5000", "request-timeout-ms", 1_000, 30_000);
const outputPath = resolve(required(args, "output"));
const summaryPath = resolve(required(args, "summary-output"));
if (outputPath === summaryPath) throw new Error("output and summary-output must be different files");

await Promise.all([mkdir(dirname(outputPath), { recursive: true, mode: 0o700 }), mkdir(dirname(summaryPath), { recursive: true, mode: 0o700 })]);
const output = await open(outputPath, "wx", 0o600);
const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());
const samples = [];
const digest = createHash("sha256");
const startedMonotonicMs = performance.now();

try {
  for (let sampleIndex = 0; ; sampleIndex += 1) {
    const sample = await captureSample({ observerId, sampleIndex, healthUrl, requestTimeoutMs, aborted: stop.signal.aborted, startedMonotonicMs });
    samples.push(sample);
    const line = `${JSON.stringify(sample)}\n`;
    await output.write(line, null, "utf8");
    await output.sync();
    digest.update(line);

    const elapsedMs = performance.now() - startedMonotonicMs;
    if (elapsedMs >= durationSeconds * 1000 || stop.signal.aborted) break;
    await delay(Math.min(intervalSeconds * 1000, durationSeconds * 1000 - elapsedMs), stop.signal);
  }
} finally {
  await output.close();
}

const summary = {
  ...evaluateGrantM1CanarySoak({ observerId, intervalSeconds, samples, requiredDurationSeconds: durationSeconds }),
  raw_jsonl_sha256: digest.digest("hex"),
  raw_jsonl_path_basename: outputPath.split(/[\\/]/u).at(-1),
};
const summaryHandle = await open(summaryPath, "wx", 0o600);
try {
  await summaryHandle.writeFile(`${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await summaryHandle.sync();
} finally {
  await summaryHandle.close();
}
process.stdout.write(`${JSON.stringify({ event: "GRANT_M1_CANARY_SOAK_COMPLETE", observerId, admitted: summary.admitted, samples: samples.length, summary: summaryPath })}\n`);
if (!summary.admitted) process.exitCode = 1;

async function captureSample({ observerId, sampleIndex, healthUrl, requestTimeoutMs, aborted, startedMonotonicMs }) {
  const capturedAt = new Date().toISOString();
  const started = performance.now();
  const elapsedMs = () => performance.now() - startedMonotonicMs;
  if (aborted) return createGrantM1CanarySample({ observerId, sampleIndex, capturedAt, elapsedMs: elapsedMs(), latencyMs: 0, errorCode: "ABORTED" });
  try {
    const response = await fetch(healthUrl, { redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs), headers: { accept: "application/json" } });
    const text = await response.text();
    if (text.length === 0 || text.length > 64 * 1024) return createGrantM1CanarySample({ observerId, sampleIndex, capturedAt, elapsedMs: elapsedMs(), latencyMs: performance.now() - started, errorCode: "INVALID_JSON" });
    let snapshot;
    try { snapshot = JSON.parse(text); } catch { return createGrantM1CanarySample({ observerId, sampleIndex, capturedAt, elapsedMs: elapsedMs(), latencyMs: performance.now() - started, errorCode: "INVALID_JSON" }); }
    return createGrantM1CanarySample({ observerId, sampleIndex, capturedAt, elapsedMs: elapsedMs(), latencyMs: performance.now() - started, httpStatus: response.status, healthSnapshot: snapshot });
  } catch (error) {
    const code = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "TIMEOUT" : "NETWORK_ERROR";
    return createGrantM1CanarySample({ observerId, sampleIndex, capturedAt, elapsedMs: elapsedMs(), latencyMs: performance.now() - started, errorCode: code });
  }
}

function delay(milliseconds, signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolveDelay => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolveDelay(); }
  });
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
  const allowed = new Set(["observer-id", "health-url", "duration-seconds", "interval-seconds", "request-timeout-ms", "output", "summary-output"]);
  for (const key of parsed.keys()) if (!allowed.has(key)) throw new Error(`unknown argument --${key}`);
  return parsed;
}

function required(values, key) {
  const value = values.get(key);
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

function integer(value, label, minimum, maximum) {
  if (!/^[0-9]+$/u.test(value)) throw new Error(`--${label} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`--${label} must be from ${minimum} to ${maximum}`);
  return parsed;
}
