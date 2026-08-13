import { createServer } from "node:http";

import { generateKeyPairSigner } from "@solana/kit";
import { afterEach, describe, expect, test } from "vitest";

import { buildSignedProbe, declareProbeUnits, type ProbeDefinition } from "../../probes/src/index.js";
import {
  classifyControlledWireTransaction,
  startControlledHostileProxy,
  type ControlledHostileProxyConfig,
  type RunningControlledHostileProxy,
} from "./index.js";

const running: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(running.splice(0).reverse().map(server => server.close()));
});

describe("controlled wire-transaction classifier", () => {
  test("recognizes only the exact matched-builder shape", async () => {
    const fixture = await buildFixture();
    expect(classifyControlledWireTransaction(fixture.control.wireTransactionBase64, fixture.programAddress)).toEqual({
      kind: "CONTROLLED",
      value: { classification: "MATCHED_CONTROL", pairNonceHex: fixture.control.pairNonceHex },
    });
    expect(classifyControlledWireTransaction(fixture.programX.wireTransactionBase64, fixture.programAddress)).toEqual({
      kind: "CONTROLLED",
      value: { classification: "PROGRAM_X", pairNonceHex: fixture.programX.pairNonceHex },
    });
    expect(classifyControlledWireTransaction("not-base64", fixture.programAddress)).toMatchObject({ kind: "UNKNOWN" });
    expect(classifyControlledWireTransaction(fixture.control.wireTransactionBase64, "11111111111111111111111111111111")).toMatchObject({ kind: "UNKNOWN" });
  });
});

describe("ControlledHostileProxy network service", () => {
  test("passes controlled transactions through byte-for-byte in PASS_THROUGH mode", async () => {
    const fixture = await buildFixture();
    const upstream = await startFakeUpstream();
    const proxy = await startProxy(upstream.url, fixture.programAddress, { type: "PASS_THROUGH", scheduleId: "healthy-v1" });
    const response = await rpc(proxy.url, fixture.control.wireTransactionBase64, 7);

    expect(response).toEqual({ jsonrpc: "2.0", id: 7, result: "upstream-signature" });
    expect(upstream.bodies).toHaveLength(1);
    expect(JSON.parse(upstream.bodies[0]!)).toMatchObject({ method: "sendTransaction", params: [fixture.control.wireTransactionBase64, { encoding: "base64" }] });
    expect(proxy.auditEvents).toEqual([expect.objectContaining({ decision: "PASS_THROUGH", classification: "MATCHED_CONTROL", modeType: "PASS_THROUGH" })]);
  });

  test("selectively rejects PROGRAM_X and passes its matched control", async () => {
    const fixture = await buildFixture();
    const upstream = await startFakeUpstream();
    const proxy = await startProxy(upstream.url, fixture.programAddress, {
      type: "REJECT_CLASS",
      transactionClass: "PROGRAM_X",
      scheduleId: "selective-program-x-v1",
    });

    const rejected = await rpc(proxy.url, fixture.programX.wireTransactionBase64, 1);
    const passed = await rpc(proxy.url, fixture.control.wireTransactionBase64, 2);
    expect(rejected).toMatchObject({ id: 1, error: { code: -32098, message: "Controlled experiment rejection" } });
    expect(passed).toMatchObject({ id: 2, result: "upstream-signature" });
    expect(upstream.bodies).toHaveLength(1);
    expect(proxy.auditEvents.map(event => [event.classification, event.decision])).toEqual([
      ["PROGRAM_X", "REJECTED"],
      ["MATCHED_CONTROL", "PASS_THROUGH"],
    ]);
    expect(JSON.stringify(proxy.auditEvents)).not.toContain(fixture.programX.pairNonceHex);
    expect(JSON.stringify(proxy.auditEvents)).not.toContain(fixture.programX.wireTransactionBase64);
  });

  test("applies deterministic general degradation to both classes of a scheduled pair only", async () => {
    const fixture = await buildFixture([0, 1]);
    const scheduled = fixture.probes.filter(probe => probe.unit.probeIndex === 0);
    const unscheduled = fixture.probes.filter(probe => probe.unit.probeIndex === 1);
    const upstream = await startFakeUpstream();
    const externalSchedule = new Set([scheduled[0]!.pairNonceHex]);
    const proxy = await startProxy(upstream.url, fixture.programAddress, {
      type: "GENERAL_DEGRADATION",
      rejectPairNonceHexes: externalSchedule,
      scheduleId: "general-70pct-precommitted-v1",
    });
    externalSchedule.clear();
    externalSchedule.add(unscheduled[0]!.pairNonceHex);

    for (const probe of scheduled) expect(await rpc(proxy.url, probe.wireTransactionBase64, probe.discriminator)).toMatchObject({ error: { code: -32098 } });
    for (const probe of unscheduled) expect(await rpc(proxy.url, probe.wireTransactionBase64, probe.discriminator + 10)).toMatchObject({ result: "upstream-signature" });
    expect(proxy.auditEvents.filter(event => event.decision === "REJECTED").map(event => event.classification).sort()).toEqual(["MATCHED_CONTROL", "PROGRAM_X"]);
    expect(upstream.bodies).toHaveLength(2);
  });

  test("fails open to pass-through for unknown, malformed, and non-send methods", async () => {
    const fixture = await buildFixture();
    const upstream = await startFakeUpstream();
    const proxy = await startProxy(upstream.url, fixture.programAddress, {
      type: "REJECT_CLASS",
      transactionClass: "PROGRAM_X",
      scheduleId: "selective-v1",
    });

    expect(await postJson(proxy.url, { jsonrpc: "2.0", id: 1, method: "sendTransaction", params: ["not-base64"] })).toMatchObject({ result: "upstream-signature" });
    expect(await postJson(proxy.url, { jsonrpc: "2.0", id: 2, method: "getHealth" })).toMatchObject({ result: "upstream-signature" });
    const malformedResponse = await fetch(proxy.url, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(await malformedResponse.json()).toMatchObject({ result: "upstream-signature" });
    expect(upstream.bodies).toHaveLength(3);
    expect(proxy.auditEvents.every(event => event.classification === "UNKNOWN" && event.decision !== "REJECTED")).toBe(true);
  });

  test("refuses non-loopback or non-allowlisted upstreams and enforces request size", async () => {
    const fixture = await buildFixture();
    await expect(startControlledHostileProxy(config("http://example.com", fixture.programAddress, { type: "PASS_THROUGH", scheduleId: "x" }))).rejects.toThrow(/allowlisted|loopback/);
    const upstream = await startFakeUpstream();
    const proxy = await startControlledHostileProxy({
      ...config(upstream.url, fixture.programAddress, { type: "PASS_THROUGH", scheduleId: "limit-v1" }),
      limits: { maxRequestBytes: 8, maxResponseBytes: 1024, maxConcurrentRequests: 1, maxAuditEvents: 100, upstreamTimeoutMs: 1_000 },
    });
    running.push(proxy);
    const response = await fetch(proxy.url, { method: "POST", headers: { "content-type": "application/json" }, body: "0123456789" });
    expect(response.status).toBe(413);
    expect(upstream.bodies).toHaveLength(0);
  });

  test("enforces concurrency and records upstream timeout without becoming an open queue", async () => {
    const fixture = await buildFixture();
    const upstream = await startFakeUpstream({ delayMs: 50 });
    const proxy = await startControlledHostileProxy({
      ...config(upstream.url, fixture.programAddress, { type: "PASS_THROUGH", scheduleId: "bounded-v1" }),
      limits: { maxRequestBytes: 256_000, maxResponseBytes: 256_000, maxConcurrentRequests: 1, maxAuditEvents: 100, upstreamTimeoutMs: 10 },
    });
    running.push(proxy);
    const first = rpc(proxy.url, fixture.control.wireTransactionBase64, 1);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 2));
    const secondResponse = await fetch(proxy.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "getHealth" }),
    });
    expect(secondResponse.status).toBe(503);
    expect(await first).toMatchObject({ error: { code: -32096 } });
    expect(proxy.auditEvents.some(event => event.decision === "RESOURCE_LIMIT")).toBe(true);
    expect(proxy.auditEvents.some(event => event.decision === "UPSTREAM_ERROR")).toBe(true);
  });

  test("caps streamed upstream responses", async () => {
    const fixture = await buildFixture();
    const upstream = await startFakeUpstream({ result: "response-larger-than-limit" });
    const proxy = await startControlledHostileProxy({
      ...config(upstream.url, fixture.programAddress, { type: "PASS_THROUGH", scheduleId: "response-limit-v1" }),
      limits: { maxRequestBytes: 256_000, maxResponseBytes: 8, maxConcurrentRequests: 2, maxAuditEvents: 100, upstreamTimeoutMs: 1_000 },
    });
    running.push(proxy);
    expect(await rpc(proxy.url, fixture.control.wireTransactionBase64, 1)).toMatchObject({ error: { code: -32097 } });
    expect(proxy.auditEvents.at(-1)).toMatchObject({ decision: "UPSTREAM_ERROR", reason: "UPSTREAM_RESPONSE_LIMIT" });
  });

  test("stops forwarding at audit capacity and exposes immutable snapshots", async () => {
    const fixture = await buildFixture();
    const upstream = await startFakeUpstream();
    const proxy = await startControlledHostileProxy({
      ...config(upstream.url, fixture.programAddress, { type: "PASS_THROUGH", scheduleId: "audit-cap-v1" }),
      limits: { maxRequestBytes: 256_000, maxResponseBytes: 256_000, maxConcurrentRequests: 2, maxAuditEvents: 1, upstreamTimeoutMs: 1_000 },
    });
    running.push(proxy);
    expect(await rpc(proxy.url, fixture.control.wireTransactionBase64, 1)).toMatchObject({ result: "upstream-signature" });
    const snapshot = proxy.auditEvents;
    expect(Object.isFrozen(snapshot[0])).toBe(true);
    (snapshot as unknown[]).pop();
    expect(proxy.auditEvents).toHaveLength(1);
    const blocked = await fetch(proxy.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "getHealth" }),
    });
    expect(blocked.status).toBe(503);
    expect(upstream.bodies).toHaveLength(1);
  });
});

async function buildFixture(probeIndices: readonly number[] = [0]) {
  const [program, feePayer] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
  const definition: ProbeDefinition = {
    experimentId: "hostile-proxy-test",
    experimentVersion: "1",
    phase: "healthy",
    observerId: "observer-local",
    routeIds: ["route-a"],
    transactionClasses: ["MATCHED_CONTROL", "PROGRAM_X"],
    probeIndices,
    randomizationSeed: "hostile-proxy-test-seed",
    pairingWindowMs: 5_000,
    programAddress: program.address,
    computeUnitLimit: 20_000,
    computeUnitPriceMicroLamports: 0n,
    expectedComputeUnits: { MATCHED_CONTROL: 1_000, PROGRAM_X: 1_000 },
    feePayerPolicy: "test-only",
    blockhashCommitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: false,
    maxRetries: 0,
  };
  const units = declareProbeUnits(definition);
  const probes = await Promise.all(units.map(unit => buildSignedProbe(definition, unit, {
    feePayer,
    lifetime: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 100n, contextSlot: 90n },
  })));
  return {
    programAddress: program.address,
    probes,
    control: probes.find(probe => probe.unit.probeIndex === 0 && probe.unit.transactionClass === "MATCHED_CONTROL")!,
    programX: probes.find(probe => probe.unit.probeIndex === 0 && probe.unit.transactionClass === "PROGRAM_X")!,
  };
}

async function startFakeUpstream(options: { readonly delayMs?: number; readonly result?: string } = {}): Promise<{ url: string; bodies: string[]; close(): Promise<void> }> {
  const bodies: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", chunk => chunks.push(Buffer.from(chunk)));
    request.on("end", async () => {
      bodies.push(Buffer.concat(chunks).toString("utf8"));
      if (options.delayMs !== undefined) await new Promise(resolveDelay => setTimeout(resolveDelay, options.delayMs));
      const parsed = safeJson(bodies.at(-1)!);
      const body = JSON.stringify({ jsonrpc: "2.0", id: typeof parsed === "object" && parsed !== null && "id" in parsed ? parsed.id : null, result: options.result ?? "upstream-signature" });
      response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
      response.end(body);
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => { server.off("error", rejectListen); resolveListen(); });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake upstream failed to bind");
  const result = {
    url: `http://127.0.0.1:${address.port}`,
    bodies,
    close: () => new Promise<void>((resolveClose, rejectClose) => server.close(error => error === undefined ? resolveClose() : rejectClose(error))),
  };
  running.push(result);
  return result;
}

async function startProxy(upstreamUrl: string, programAddress: string, mode: ControlledHostileProxyConfig["mode"]): Promise<RunningControlledHostileProxy> {
  const proxy = await startControlledHostileProxy(config(upstreamUrl, programAddress, mode));
  running.push(proxy);
  return proxy;
}

function config(upstreamUrl: string, controlledProgramAddress: string, mode: ControlledHostileProxyConfig["mode"]): ControlledHostileProxyConfig {
  return {
    bindHost: "127.0.0.1",
    bindPort: 0,
    upstreamUrl,
    allowedUpstreamUrls: [upstreamUrl],
    controlledProgramAddress,
    mode,
    limits: { maxRequestBytes: 256_000, maxResponseBytes: 256_000, maxConcurrentRequests: 8, maxAuditEvents: 10_000, upstreamTimeoutMs: 2_000 },
  };
}

function rpc(url: string, wireTransactionBase64: string, id: number): Promise<Record<string, unknown>> {
  return postJson(url, { jsonrpc: "2.0", id, method: "sendTransaction", params: [wireTransactionBase64, { encoding: "base64" }] });
}

async function postJson(url: string, body: object): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return await response.json() as Record<string, unknown>;
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return undefined; }
}
