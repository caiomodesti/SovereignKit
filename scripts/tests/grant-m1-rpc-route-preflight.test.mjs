import test from "node:test";
import assert from "node:assert/strict";

import {
  GRANT_M1_RPC_ROUTE_PREFLIGHT_VERSION,
  runGrantRpcRoutePreflight,
  sanitizeGrantRpcEndpoint,
  validateGrantRpcEndpoint,
} from "../lib/grant-m1-rpc-route-preflight.mjs";

test("produces sanitized evidence for one healthy logical RPC route", async () => {
  const secretEndpoint = "https://solana-devnet.example.test/v2/private-key-material";
  const calls = [];
  const results = {
    getHealth: "ok",
    getGenesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    getVersion: { "solana-core": "2.2.0", "feature-set": 123 },
    getSlot: 456,
  };
  const evidence = await runGrantRpcRoutePreflight({
    endpoint: secretEndpoint,
    routeId: "alchemy-solana-devnet",
    providerLabel: "Alchemy",
    capturedAt: "2026-08-26T12:00:00.000Z",
    fetchImpl: async (url, init) => {
      const request = JSON.parse(init.body);
      calls.push({ url, method: request.method });
      return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: request.id, result: results[request.method] }) };
    },
  });

  assert.equal(evidence.schema_version, GRANT_M1_RPC_ROUTE_PREFLIGHT_VERSION);
  assert.equal(evidence.logical_endpoint_origin, "https://solana-devnet.example.test");
  assert.equal(evidence.operational_independence_established, false);
  assert.equal(evidence.milestone_acceptance_effect, "NONE");
  assert.equal(calls.length, 4);
  assert.equal(JSON.stringify(evidence).includes("private-key-material"), false);
});

test("rejects plaintext, URL credentials, queries, and fragments", () => {
  assert.throws(() => validateGrantRpcEndpoint("http://rpc.example.test/key"), /HTTPS/u);
  assert.throws(() => validateGrantRpcEndpoint("https://user:pass@rpc.example.test/key"), /userinfo/u);
  assert.throws(() => validateGrantRpcEndpoint("https://rpc.example.test/key?token=x"), /query strings/u);
  assert.throws(() => validateGrantRpcEndpoint("https://rpc.example.test/key#secret"), /fragments/u);
});

test("sanitizes a path-carried API credential to the public origin", () => {
  assert.equal(
    sanitizeGrantRpcEndpoint("https://solana-devnet.example.test/v2/private-key-material"),
    "https://solana-devnet.example.test",
  );
});

test("fails closed without reflecting the endpoint credential", async () => {
  const secretEndpoint = "https://rpc.example.test/v2/private-key-material";
  await assert.rejects(
    runGrantRpcRoutePreflight({
      endpoint: secretEndpoint,
      routeId: "route-a",
      providerLabel: "Provider A",
      fetchImpl: async () => { throw new Error("network error"); },
    }),
    error => error instanceof Error && /getHealth/u.test(error.message) && !error.message.includes("private-key-material"),
  );
});
