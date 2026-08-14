import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { IntelligenceSnapshotClient, ReactiveRouter, buildIntelligenceSnapshot } from "../packages/sdk/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const summaryPath = resolve(root, "fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/summary/experiment-summary.json");
const resultsPath = resolve(root, "fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/raw/probe-results.jsonl");
const evidencePath = resolve(root, "fixtures/sprint-9/probe-informed-routing-evidence.json");
const summary = JSON.parse(await readFile(summaryPath, "utf8"));
const results = (await readFile(resultsPath, "utf8")).trimEnd().split("\n").map(line => JSON.parse(line));
const observedAt = results.map(result => result.observer_wall_time).sort().at(-1);
if (observedAt === undefined) throw new Error("asymmetric source fixture has no observation time");

const generatedAt = new Date("2026-08-14T00:00:00.000Z");
const freshNow = new Date("2026-08-14T00:00:01.000Z");
const staleNow = new Date("2026-08-14T00:01:00.000Z");
const snapshots = [1, 2].map(version => buildIntelligenceSnapshot({
  version,
  generatedAt,
  ttlMs: 60_000,
  summaries: [{ ...summary, observedAt }],
}));
let snapshotIndex = 0;
const client = new IntelligenceSnapshotClient({ pollTimeoutMs: 100, fetchSnapshot: async () => snapshots[snapshotIndex++] });
assert.deepEqual(await client.poll(freshNow), { status: "APPLIED", version: 1 });
assert.deepEqual(await client.poll(freshNow), { status: "APPLIED", version: 2 });

const freshProgramX = project(await execute({ client, transactionClass: "PROGRAM_X", now: freshNow, maxRoutes: 3 }));
const freshControl = project(await execute({ client, transactionClass: "MATCHED_CONTROL", now: freshNow, maxRoutes: 3 }));
const boundedProgramX = project(await execute({ client, transactionClass: "PROGRAM_X", now: freshNow, maxRoutes: 2 }));
const staleProgramX = project(await execute({ client, transactionClass: "PROGRAM_X", now: staleNow, maxRoutes: 3 }));
const legacyLocal = project(await execute({ client, now: staleNow, maxRoutes: 3 }));
const computed = {
  evidenceVersion: "Sprint9ProbeInformedRouting@0.1.0",
  sourceScenario: "asymmetric",
  sourceInputHash: summary.inputHash,
  sourceObservedAt: observedAt,
  snapshotInputHash: snapshots[1].input_hash,
  routerVersion: freshProgramX.routerVersion,
  cases: { freshProgramX, freshControl, boundedProgramX, staleProgramX, legacyLocal },
};

if (process.argv.includes("--print")) {
  process.stdout.write(`${JSON.stringify(computed, null, 2)}\n`);
} else {
  const retained = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.deepEqual(computed, retained, "Sprint 9 routing evidence did not reproduce exactly");
  assert.deepEqual(freshProgramX.selectedRouteIds, ["route-b", "route-c", "route-a"]);
  assert.deepEqual(freshControl.selectedRouteIds, ["route-a", "route-b", "route-c"]);
  assert.deepEqual(boundedProgramX.selectedRouteIds, ["route-b", "route-a"]);
  assert.deepEqual(staleProgramX.selectedRouteIds, ["route-a", "route-b", "route-c"]);
  assert.deepEqual(legacyLocal.selectedRouteIds, ["route-a", "route-b", "route-c"]);
  assert.equal(freshProgramX.finalState, "CONFIRMED");
  assert.equal(freshProgramX.intelligenceDecisions[0]?.disposition, "AVOID");
  assert.equal(staleProgramX.intelligenceDecisions[0]?.source, "FAIL_OPEN");
  assert.equal(legacyLocal.routingMode, "LOCAL_PRIMARY_FALLBACK");
  process.stdout.write(`${JSON.stringify({ reproduced: true, routerVersion: computed.routerVersion, sourceInputHash: computed.sourceInputHash, cases: Object.keys(computed.cases) })}\n`);
}

async function execute({ client, transactionClass, now, maxRoutes }) {
  const routes = ["route-a", "route-b", "route-c"].map(routeId => ({
    routeId,
    logicalEndpoint: `http://127.0.0.1/${routeId}`,
    transport: "http_json_rpc",
    observerRegion: "local",
    configurationProfile: "sprint-9-fixture-v1",
    submissionClientIdentity: `submit-${routeId}`,
  }));
  const router = new ReactiveRouter({
    routes,
    policy: { maxRoutes, routeTimeoutMs: 50, observationTimeoutMs: 50, overallDeadlineMs: 1_000, telemetryHookTimeoutMs: 20, requiredObservationQuorum: 2 },
    intelligenceSource: client,
    submitter: { submit: async (_route, transaction) => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature }) },
    observer: {
      readers: [
        { readerId: "reader-1", clientIdentity: "reader-client-1" },
        { readerId: "reader-2", clientIdentity: "reader-client-2" },
        { readerId: "reader-3", clientIdentity: "reader-client-3" },
      ],
      observe: async () => ({ state: "CONFIRMED", supportingReaderIds: ["reader-1", "reader-2"] }),
    },
    wallClock: () => now,
  });
  const transaction = { transactionId: "sprint-9-fixture", signature: "fixture-signature", wireTransactionBase64: "AQID" };
  return transactionClass === undefined ? router.route(transaction) : router.route(transaction, { transactionClass });
}

function project(result) {
  return {
    routerVersion: result.routerVersion,
    routingMode: result.routingMode,
    configuredRouteIds: result.configuredRouteIds,
    selectedRouteIds: result.selectedRouteIds,
    intelligenceDecisions: result.intelligenceDecisions,
    ...(result.declaredTransactionClass === undefined ? {} : { declaredTransactionClass: result.declaredTransactionClass }),
    finalState: result.finalState,
    confirmationObservedAfterRouteId: result.confirmationObservedAfterRouteId,
    visitedRouteIds: result.visitedRouteIds,
  };
}
