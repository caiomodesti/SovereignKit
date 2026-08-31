import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { runGrantM1CollectorTlsPreflight } from "./lib/grant-m1-collector-tls-preflight.mjs";

const args = parseArgs(process.argv.slice(2));
const componentId = required(args, "component-id");
const collectorOrigin = required(args, "collector-origin");
const expectedAddressPath = resolve(required(args, "expected-address-file"));
const outputPath = resolve(required(args, "output"));
const timeoutMs = integer(args.get("timeout-ms") ?? "10000", "timeout-ms", 1_000, 30_000);
const expectedAddress = (await readFile(expectedAddressPath, "utf8")).trim();
const evidence = await runGrantM1CollectorTlsPreflight({ componentId, collectorOrigin, expectedAddress, timeoutMs });
const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
const handle = await open(outputPath, "wx", 0o600);
try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
process.stdout.write(`${JSON.stringify({ event: "GRANT_M1_COLLECTOR_TLS_PREFLIGHT_CAPTURED", componentId, output: outputPath, sha256: createHash("sha256").update(bytes).digest("hex") })}\n`);

function parseArgs(values) {
  if (values.length % 2 !== 0) throw new Error("arguments must use --name value pairs");
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index], value = values[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("arguments must use --name value pairs");
    const key = name.slice(2); if (parsed.has(key)) throw new Error(`duplicate argument --${key}`); parsed.set(key, value);
  }
  const allowed = new Set(["component-id", "collector-origin", "expected-address-file", "output", "timeout-ms"]);
  for (const key of parsed.keys()) if (!allowed.has(key)) throw new Error(`unknown argument --${key}`);
  return parsed;
}
function required(values, key) { const value = values.get(key); if (!value) throw new Error(`--${key} is required`); return value; }
function integer(value, label, minimum, maximum) { if (!/^[0-9]+$/u.test(value)) throw new Error(`--${label} must be an integer`); const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`--${label} must be from ${minimum} to ${maximum}`); return parsed; }
