import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { Ajv2020 } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import { describe, expect, test } from "vitest";

import {
  IntelligenceSnapshotClient,
  buildIntelligenceSnapshot,
  createHttpSnapshotFetcher,
  type IntelligenceClassification,
  type IntelligenceSnapshot,
  type IntelligenceSummaryInput,
} from "./intelligence.js";

const addFormats = addFormatsModule.default as unknown as (ajv: Ajv2020) => Ajv2020;
const generatedAt = new Date("2026-08-14T00:00:00.000Z");

describe("versioned intelligence snapshot generation", () => {
  test("is deterministic, provenance-complete, and valid against the committed schema", async () => {
    const first = buildSnapshot(1, "ASYMMETRIC");
    const second = buildSnapshot(1, "ASYMMETRIC");
    expect(first).toEqual(second);
    expect(first.route_intelligence).toEqual([
      expect.objectContaining({ route_id: "route-a", transaction_class: "MATCHED_CONTROL", classification: "HEALTHY", sample_count: 30, source_input_hash: "a".repeat(64) }),
      expect.objectContaining({ route_id: "route-a", transaction_class: "PROGRAM_X", classification: "ASYMMETRIC", sample_count: 30, source_input_hash: "a".repeat(64) }),
    ]);

    const schema = JSON.parse(await readFile(new URL("../../../spec/intelligence-snapshot.schema.json", import.meta.url), "utf8")) as object;
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(first), JSON.stringify(validate.errors)).toBe(true);
  });

  test("rejects invalid TTL, thresholds, and duplicate route/class sources", () => {
    expect(() => buildIntelligenceSnapshot({ version: 1, generatedAt, ttlMs: 0, summaries: [summary("HEALTHY")] })).toThrow(/ttlMs/);
    expect(() => buildIntelligenceSnapshot({ version: 1, generatedAt, ttlMs: 60_000, summaries: [summary("HEALTHY")], avoidAfterConsecutiveSnapshots: 0 })).toThrow(/threshold/);
    expect(() => buildIntelligenceSnapshot({ version: 1, generatedAt, ttlMs: 60_000, summaries: [summary("HEALTHY"), summary("HEALTHY")] })).toThrow(/duplicate/);
    expect(() => createHttpSnapshotFetcher("http://example.com/snapshot")).toThrow(/HTTPS/);
    expect(() => createHttpSnapshotFetcher("https://user:secret@example.com/snapshot")).toThrow(/credentials/);
    expect(() => buildIntelligenceSnapshot({ version: 1, generatedAt, ttlMs: 60_000, summaries: [{ ...summary("HEALTHY"), cells: [{ routeId: "route-a", transactionClass: "MATCHED_CONTROL", completeCount: -1 }, summary("HEALTHY").cells[1]!] }] })).toThrow(/generated snapshot is invalid/);
  });
});

describe("polling, TTL, hysteresis, override, and fail-open", () => {
  test("requires two distinct avoid snapshots and does not count a repeated version twice", async () => {
    const v1 = buildSnapshot(1, "ASYMMETRIC");
    const v2 = buildSnapshot(2, "ASYMMETRIC");
    const client = queuedClient([v1, v1, v2]);
    expect(await client.poll(now())).toEqual({ status: "APPLIED", version: 1 });
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("LOCAL_PRIMARY_FALLBACK");
    expect(await client.poll(now())).toEqual({ status: "UNCHANGED", version: 1 });
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("LOCAL_PRIMARY_FALLBACK");
    expect(await client.poll(now())).toEqual({ status: "APPLIED", version: 2 });
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("AVOID");
    expect(client.disposition("route-a", "MATCHED_CONTROL", now())).toBe("LOCAL_PRIMARY_FALLBACK");
  });

  test("requires three healthy snapshots to restore an avoided class", async () => {
    const client = queuedClient([
      buildSnapshot(1, "ASYMMETRIC"), buildSnapshot(2, "ASYMMETRIC"),
      buildSnapshot(3, "HEALTHY"), buildSnapshot(4, "HEALTHY"), buildSnapshot(5, "HEALTHY"),
    ]);
    await client.poll(now());
    await client.poll(now());
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("AVOID");
    await client.poll(now());
    await client.poll(now());
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("AVOID");
    await client.poll(now());
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("LOCAL_PRIMARY_FALLBACK");
  });

  test("fails open while unavailable and recovers from the same still-fresh version without another hysteresis vote", async () => {
    const v1 = buildSnapshot(1, "ASYMMETRIC");
    const v2 = buildSnapshot(2, "ASYMMETRIC");
    let call = 0;
    const client = new IntelligenceSnapshotClient({
      pollTimeoutMs: 50,
      fetchSnapshot: async () => {
        call += 1;
        if (call === 1) return v1;
        if (call === 2) return v2;
        if (call === 3) throw new TypeError("offline");
        return v2;
      },
    });
    await client.poll(now());
    await client.poll(now());
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("AVOID");
    expect(await client.poll(now())).toMatchObject({ status: "FAIL_OPEN" });
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("LOCAL_PRIMARY_FALLBACK");
    expect(await client.poll(now())).toEqual({ status: "UNCHANGED", version: 2 });
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("AVOID");
  });

  test("fails open for stale, malformed, future, and rolled-back snapshots", async () => {
    const valid = buildSnapshot(2, "HEALTHY");
    const values: unknown[] = [
      { ...valid, expires_at: "2026-08-14T00:00:00.500Z" },
      { ...valid, unknown: true },
      { ...valid, generated_at: "2026-08-14T00:00:02.000Z", expires_at: "2026-08-14T00:01:02.000Z" },
      buildSnapshot(3, "HEALTHY"),
      buildSnapshot(2, "HEALTHY"),
    ];
    const client = queuedClient(values);
    expect(await client.poll(now())).toMatchObject({ status: "FAIL_OPEN", reason: "snapshot is stale" });
    expect(await client.poll(now())).toMatchObject({ status: "FAIL_OPEN", reason: /schema/ });
    expect(await client.poll(now())).toMatchObject({ status: "FAIL_OPEN", reason: /future/ });
    expect(await client.poll(now())).toEqual({ status: "APPLIED", version: 3 });
    expect(await client.poll(now())).toMatchObject({ status: "FAIL_OPEN", reason: /rollback/ });
  });

  test("developer override has explicit priority over feed availability", async () => {
    const client = new IntelligenceSnapshotClient({
      pollTimeoutMs: 10,
      fetchSnapshot: async () => { throw new Error("offline"); },
      developerOverride: (routeId, transactionClass) => routeId === "route-a" && transactionClass === "PROGRAM_X" ? "AVOID" : undefined,
    });
    await client.poll(now());
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("AVOID");
    expect(client.disposition("route-a", "MATCHED_CONTROL", now())).toBe("LOCAL_PRIMARY_FALLBACK");
  });

  test("fails open on same-version equivocation and on a throwing override", async () => {
    const first = buildSnapshot(1, "HEALTHY");
    const equivocation = { ...first, input_hash: "f".repeat(64) };
    const client = new IntelligenceSnapshotClient({
      pollTimeoutMs: 50,
      fetchSnapshot: queuedFetcher([first, equivocation]),
      developerOverride: () => { throw new Error("bad override"); },
    });
    expect(await client.poll(now())).toEqual({ status: "APPLIED", version: 1 });
    expect(await client.poll(now())).toMatchObject({ status: "FAIL_OPEN", reason: /equivocation/ });
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("LOCAL_PRIMARY_FALLBACK");
  });

  test("times out a poll and returns local policy", async () => {
    const client = new IntelligenceSnapshotClient({ pollTimeoutMs: 5, fetchSnapshot: async () => new Promise(() => undefined) });
    expect(await client.poll(now())).toMatchObject({ status: "FAIL_OPEN", reason: "snapshot poll timed out" });
    expect(client.disposition("route-a", "PROGRAM_X", now())).toBe("LOCAL_PRIMARY_FALLBACK");
  });

  test("rechecks TTL at decision time even when no later poll occurs", async () => {
    const client = queuedClient([buildSnapshot(1, "ASYMMETRIC"), buildSnapshot(2, "ASYMMETRIC")]);
    await client.poll(now());
    await client.poll(now());
    expect(client.decision("route-a", "PROGRAM_X", now())).toMatchObject({ disposition: "AVOID", source: "SNAPSHOT", snapshotVersion: 2 });
    expect(client.decision("route-a", "PROGRAM_X", new Date("2026-08-14T00:01:00.000Z"))).toEqual({
      disposition: "LOCAL_PRIMARY_FALLBACK",
      source: "FAIL_OPEN",
      reason: "snapshot became stale before routing decision",
    });
  });

  test("fails open when the routing clock moves before snapshot generation", async () => {
    const client = queuedClient([buildSnapshot(1, "HEALTHY")]);
    await client.poll(now());
    expect(client.decision("route-a", "PROGRAM_X", new Date("2026-08-13T23:59:59.999Z"))).toEqual({
      disposition: "LOCAL_PRIMARY_FALLBACK",
      source: "FAIL_OPEN",
      reason: "snapshot generated_at became future-dated before routing decision",
    });
  });

  test("fails open on an unsupported runtime developer override value", async () => {
    const client = new IntelligenceSnapshotClient({
      pollTimeoutMs: 10,
      fetchSnapshot: async () => buildSnapshot(1, "HEALTHY"),
      developerOverride: (() => "UNSUPPORTED") as never,
    });
    expect(client.decision("route-a", "PROGRAM_X", now())).toEqual({
      disposition: "LOCAL_PRIMARY_FALLBACK",
      source: "FAIL_OPEN",
      reason: "developer override returned an unsupported disposition",
    });
  });

  test("polls a bounded JSON snapshot over HTTP", async () => {
    const snapshot = buildSnapshot(1, "HEALTHY");
    const server = createServer((request, response) => {
      expect(request.method).toBe("GET");
      expect(request.headers.accept).toBe("application/json");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(snapshot));
    });
    await new Promise<void>(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("test server did not bind TCP");
    try {
      const client = new IntelligenceSnapshotClient({ pollTimeoutMs: 1_000, fetchSnapshot: createHttpSnapshotFetcher(`http://127.0.0.1:${address.port}/snapshot`) });
      expect(await client.poll(now())).toEqual({ status: "APPLIED", version: 1 });
    } finally {
      await new Promise<void>((resolveClose, reject) => server.close(error => error === undefined ? resolveClose() : reject(error)));
    }
  });

  test("rejects oversized HTTP snapshots before parsing", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json", "content-length": "1000" });
      response.end("{}");
    });
    await new Promise<void>(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("test server did not bind TCP");
    try {
      const client = new IntelligenceSnapshotClient({ pollTimeoutMs: 1_000, fetchSnapshot: createHttpSnapshotFetcher(`http://127.0.0.1:${address.port}/snapshot`, { maxBodyBytes: 10 }) });
      expect(await client.poll(now())).toMatchObject({ status: "FAIL_OPEN", reason: /body limit/ });
    } finally {
      await new Promise<void>((resolveClose, reject) => server.close(error => error === undefined ? resolveClose() : reject(error)));
    }
  });
});

function buildSnapshot(version: number, classification: IntelligenceClassification): IntelligenceSnapshot {
  return buildIntelligenceSnapshot({ version, generatedAt, ttlMs: 60_000, summaries: [summary(classification)] });
}

function summary(classification: IntelligenceClassification): IntelligenceSummaryInput {
  return {
    policyVersion: "ClassificationPolicyV0Experimental",
    inputHash: "a".repeat(64),
    observedAt: "2026-08-13T23:59:00.000Z",
    definition: { experimentId: "experiment-1", experimentVersion: "1", configurationHash: "b".repeat(64), windowId: "window-1", observerId: "observer-1" },
    cells: [
      { routeId: "route-a", transactionClass: "MATCHED_CONTROL", completeCount: 30 },
      { routeId: "route-a", transactionClass: "PROGRAM_X", completeCount: 30 },
    ],
    classifications: [{ routeId: "route-a", classification, evidenceStrength: classification === "UNKNOWN" ? "NONE" : "LIMITED" }],
  };
}

function queuedClient(values: readonly unknown[]): IntelligenceSnapshotClient {
  return new IntelligenceSnapshotClient({
    pollTimeoutMs: 50,
    fetchSnapshot: queuedFetcher(values),
  });
}

function queuedFetcher(values: readonly unknown[]): () => Promise<unknown> {
  let index = 0;
  return async () => {
    const value = values[index++];
    if (value === undefined) throw new Error("queue exhausted");
    return value;
  };
}

function now(): Date {
  return new Date("2026-08-14T00:00:01.000Z");
}
