import { execFile as execFileCallback } from "node:child_process";
import { lstat, open, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { evaluateCollectorDurableReplay } from "./lib/grant-m1-collector-durable-replay.mjs";

const execFile = promisify(execFileCallback);
if (process.platform !== "linux" || process.geteuid?.() !== 0) throw new Error("Collector durable replay drill must run as root on the target Linux host");
const args = parseArgs(process.argv.slice(2));
const fixturePath = resolve(required(args, "fixture"));
const evidencePath = resolve(required(args, "evidence-path"));
const outputPath = resolve(required(args, "output"));
const service = args.get("service") ?? "sovereignkit-collector.service";
const url = validateUrl(args.get("collector-url") ?? "http://127.0.0.1:8787");
const line = (await readFile(fixturePath, "utf8")).split(/\r?\n/u).find(Boolean);
if (!line) throw new Error("signed result fixture is empty");
const parsed = JSON.parse(line);
const result = parsed?.result ?? parsed;

const before = await health(url);
const accepted = await post(url, result);
const afterAccept = await health(url);
await execFile("systemctl", ["restart", service], { timeout: 30_000, windowsHide: true });
const afterRestart = await waitForHealth(url, 60_000);
const replay = await post(url, result);
const afterReplay = await health(url);
const evidenceText = await readFile(evidencePath, "utf8");
const evidenceMetadata = await lstat(evidencePath);
const record = evaluateCollectorDurableReplay({ capturedAt: new Date().toISOString(), beforeStoredCount: before.storedCount, acceptStatus: accepted.status, afterAcceptStoredCount: afterAccept.storedCount, serviceRestarted: true, afterRestartStoredCount: afterRestart.storedCount, replayStatus: replay.status, afterReplayStoredCount: afterReplay.storedCount, evidenceRecordCount: evidenceText.split(/\r?\n/u).filter(Boolean).length, evidenceMode: evidenceMetadata.mode & 0o777 });
const handle = await open(outputPath, "wx", 0o600);
try { await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
process.stdout.write(`${JSON.stringify({ event: "GRANT_M1_COLLECTOR_DURABLE_REPLAY_COMPLETE", passed: true, output: outputPath })}\n`);

async function health(base) { const response = await fetch(new URL("/health", base), { redirect: "error", signal: AbortSignal.timeout(5_000) }); const value = await response.json(); if (!response.ok || value.status !== "ok" || !Number.isSafeInteger(value.storedCount)) throw new Error("Collector health is invalid"); return value; }
async function post(base, result) { const response = await fetch(new URL("/v0/probe-results", base), { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(result) }); const value = await response.json(); if (![200, 201].includes(response.status)) throw new Error(`Collector ingest failed with HTTP ${response.status}`); return value; }
async function waitForHealth(base, timeoutMs) { const started = Date.now(); while (Date.now() - started < timeoutMs) { try { return await health(base); } catch { await new Promise(resolveDelay => setTimeout(resolveDelay, 1000)); } } throw new Error("Collector did not recover within the restart window"); }
function validateUrl(value) { const url = new URL(value); if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" || url.username || url.password || url.search || url.hash) throw new Error("collector-url must be loopback HTTP origin"); return url; }
function parseArgs(values) { if (values.length % 2 !== 0) throw new Error("arguments must use --name value pairs"); const parsed = new Map(); for (let index = 0; index < values.length; index += 2) { const name = values[index], value = values[index + 1]; if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("arguments must use --name value pairs"); const key = name.slice(2); if (parsed.has(key)) throw new Error(`duplicate argument --${key}`); parsed.set(key, value); } const allowed = new Set(["fixture", "evidence-path", "output", "service", "collector-url"]); for (const key of parsed.keys()) if (!allowed.has(key)) throw new Error(`unknown argument --${key}`); return parsed; }
function required(values, key) { const value = values.get(key); if (!value) throw new Error(`--${key} is required`); return value; }
