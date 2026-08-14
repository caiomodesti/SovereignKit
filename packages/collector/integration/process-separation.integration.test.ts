import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  deriveIdempotencyKey,
  exportObserverPrivateKey,
  generateObserverKeyPair,
  sha256Hex,
  type ObserverAllowlistEntry,
  type UnsignedProbeResult,
} from "@sovereignkit/probes";
import { afterEach, describe, expect, test } from "vitest";

const children: ChildProcess[] = [];
const temporaryDirectories: string[] = [];
const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

afterEach(async () => {
  for (const child of children.splice(0)) await terminate(child);
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("standalone observer and Collector", () => {
  test("persists one signed result and rejects its replay after a Collector restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-process-proof-"));
    temporaryDirectories.push(directory);
    const keyPair = generateObserverKeyPair("observer-process-br", "key-1");
    const keyPath = join(directory, "observer-private.json");
    const allowlistPath = join(directory, "allowlist.json");
    const unsignedPath = join(directory, "unsigned-result.json");
    const acceptedLogPath = join(directory, "accepted.jsonl");
    const schemaPath = join(repositoryRoot, "spec", "probe-result.schema.json");
    const allowlist: ObserverAllowlistEntry[] = [{
      observerId: keyPair.observerId,
      keyId: keyPair.keyId,
      publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
      validFrom: "2026-08-01T00:00:00.000Z",
      validUntil: "2026-09-01T00:00:00.000Z",
    }];
    await writeFile(keyPath, `${JSON.stringify(exportObserverPrivateKey(keyPair))}\n`, { encoding: "utf8", mode: 0o600 });
    await writeFile(allowlistPath, `${JSON.stringify(allowlist)}\n`, "utf8");
    await writeFile(unsignedPath, `${JSON.stringify(makeUnsignedResult(keyPair.observerId, keyPair.keyId))}\n`, "utf8");

    const first = await startCollector(schemaPath, allowlistPath, acceptedLogPath);
    expect(first.ready.storedCount).toBe(0);
    const accepted = await runObserver(keyPath, unsignedPath, first.url);
    expect(accepted.statusCode).toBe(201);
    expect(accepted.response).toMatchObject({ status: "ACCEPTED", collectorSequence: 0 });
    await terminate(first.child);

    const restarted = await startCollector(schemaPath, allowlistPath, acceptedLogPath);
    expect(restarted.ready.storedCount).toBe(1);
    const replay = await runObserver(keyPath, unsignedPath, restarted.url);
    expect(replay.statusCode).toBe(200);
    expect(replay.response).toMatchObject({ status: "DUPLICATE", storedCount: 1 });
    const records = (await readFile(acceptedLogPath, "utf8")).trimEnd().split("\n");
    expect(records).toHaveLength(1);
  }, 30_000);
});

async function startCollector(schemaPath: string, allowlistPath: string, acceptedLogPath: string): Promise<{
  readonly child: ChildProcess;
  readonly url: string;
  readonly ready: { readonly storedCount: number };
}> {
  const child = spawn(process.execPath, [
    join(repositoryRoot, "packages", "collector", "dist", "collector-process.js"),
    schemaPath,
    allowlistPath,
    acceptedLogPath,
    "0",
  ], { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const line = await firstLine(child);
  const ready = JSON.parse(line) as { event: string; port: number; storedCount: number };
  expect(ready.event).toBe("COLLECTOR_READY");
  return { child, url: `http://127.0.0.1:${ready.port}`, ready };
}

async function runObserver(keyPath: string, unsignedPath: string, url: string): Promise<{
  readonly statusCode: number;
  readonly response: unknown;
}> {
  const child = spawn(process.execPath, [
    join(repositoryRoot, "packages", "collector", "dist", "observer-process.js"),
    keyPath,
    unsignedPath,
    url,
  ], { cwd: repositoryRoot, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const stdout = await collect(child);
  const event = JSON.parse(stdout.trim()) as { event: string; statusCode: number; response: unknown };
  expect(event.event).toBe("OBSERVER_SUBMISSION_COMPLETED");
  return event;
}

function firstLine(child: ChildProcess): Promise<string> {
  return new Promise((resolveLine, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      stdout += chunk;
      const newline = stdout.indexOf("\n");
      if (newline >= 0) resolveLine(stdout.slice(0, newline));
    });
    child.stderr!.on("data", (chunk: string) => { stderr += chunk; });
    child.once("exit", code => reject(new Error(`collector exited before ready (${code}): ${stderr}`)));
  });
}

function collect(child: ChildProcess): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr!.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolveOutput(stdout) : reject(new Error(`child exited ${code}: ${stderr}`)));
  });
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>(resolveExit => child.once("exit", () => resolveExit()));
}

function makeUnsignedResult(observerId: string, keyId: string): UnsignedProbeResult {
  const unitId = sha256Hex(["sprint-6-process-proof", "1", "healthy", observerId, "route-a", "MATCHED_CONTROL", "0"].join("\u001f"));
  const claimIds = [`${unitId}:reader-1`, `${unitId}:reader-2`];
  return {
    schema_version: "0.1.0",
    result_id: randomUUID(),
    idempotency_key: deriveIdempotencyKey(observerId, unitId),
    observer_id: observerId,
    observer_key_id: keyId,
    observer_sequence: 0,
    unit: { experiment_id: "sprint-6-process-proof", experiment_version: "1", phase: "healthy", observer_id: observerId, route_id: "route-a", transaction_class: "MATCHED_CONTROL", probe_index: 0, unit_id: unitId },
    experiment_definition_hash: sha256Hex("sprint-6-process-proof-definition"),
    signature: "5".repeat(88),
    submission: { attempt_id: sha256Hex(`${unitId}:attempt-1`), attempt_number: 1, outcome: "RPC_ACKNOWLEDGED", blockhash: "11111111111111111111111111111111", blockhash_context_slot: 1, last_valid_block_height: 100, serialized_size_bytes: 240, created_at: "2026-08-13T12:00:00.000Z", submitted_at: "2026-08-13T12:00:00.100Z", response_at: "2026-08-13T12:00:00.200Z" },
    reader_claims: [
      { claim_id: claimIds[0]!, reader_id: "reader-1", observed_at: "2026-08-13T12:00:00.300Z", signature_status: "confirmed", transaction_slot: 2 },
      { claim_id: claimIds[1]!, reader_id: "reader-2", observed_at: "2026-08-13T12:00:00.310Z", signature_status: "confirmed", transaction_slot: 2 },
    ],
    quorum_decisions: [{ decision_id: sha256Hex(`${unitId}:confirmed`), decision_type: "CONFIRMED", supporting_claim_ids: claimIds, decided_at: "2026-08-13T12:00:00.320Z", quorum_rule_version: "ObservationQuorum@0.1.0" }],
    terminal_state: "CONFIRMED",
    observer_wall_time: "2026-08-13T12:00:00.400Z",
  };
}
