import { readFile } from "node:fs/promises";

import type { ObserverAllowlistEntry } from "@sovereignkit/probes";

import { DurableProbeResultCollector } from "./durable-collector.js";
import { createCollectorHttpServer } from "./http.js";

const [schemaPath, allowlistPath, acceptedLogPath, portText = "0"] = process.argv.slice(2);
if (schemaPath === undefined || allowlistPath === undefined || acceptedLogPath === undefined) {
  throw new Error("usage: sovereignkit-collector <schema.json> <allowlist.json> <accepted.jsonl> [port]");
}
const port = Number(portText);
if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new Error("port must be an integer from 0 to 65535");

const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
const allowlist = parseAllowlist(JSON.parse(await readFile(allowlistPath, "utf8")) as unknown);
const collector = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath });
const server = createCollectorHttpServer(collector);
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("collector did not bind a TCP port");
  process.stdout.write(`${JSON.stringify({ event: "COLLECTOR_READY", pid: process.pid, host: "127.0.0.1", port: address.port, storedCount: collector.storedCount() })}\n`);
});

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolveClose, reject) => {
    server.close(error => error === undefined ? resolveClose() : reject(error));
  });
  await collector.close();
  process.exitCode = 0;
}
process.on("SIGINT", () => { void stop(); });
process.on("SIGTERM", () => { void stop(); });

function parseAllowlist(value: unknown): readonly ObserverAllowlistEntry[] {
  if (!Array.isArray(value)) throw new Error("allowlist must be an array");
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.observerId !== "string" || typeof entry.keyId !== "string" ||
        typeof entry.publicKeySpkiBase64 !== "string" || typeof entry.validFrom !== "string" ||
        (entry.validUntil !== undefined && typeof entry.validUntil !== "string")) {
      throw new Error(`invalid allowlist entry at index ${index}`);
    }
    const parsed: ObserverAllowlistEntry = entry.validUntil === undefined
      ? { observerId: entry.observerId, keyId: entry.keyId, publicKeySpkiBase64: entry.publicKeySpkiBase64, validFrom: entry.validFrom }
      : { observerId: entry.observerId, keyId: entry.keyId, publicKeySpkiBase64: entry.publicKeySpkiBase64, validFrom: entry.validFrom, validUntil: entry.validUntil };
    const validFrom = Date.parse(parsed.validFrom);
    const validUntil = parsed.validUntil === undefined ? Number.POSITIVE_INFINITY : Date.parse(parsed.validUntil);
    if (parsed.observerId.length === 0 || parsed.keyId.length === 0 || !Number.isFinite(validFrom) || Number.isNaN(validUntil) || validUntil < validFrom) {
      throw new Error(`invalid allowlist identity or validity interval at index ${index}`);
    }
    return parsed;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
