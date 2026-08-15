import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const experimentRoot = resolve(root, "fixtures/integration/agave-4.0.0/controlled-experiment");
const scenarioIds = ["healthy", "degraded", "asymmetric", "insufficient_data"];
const sourceFiles = [
  "fixtures/integration/agave-4.0.0/controlled-experiment/experiment-manifest.json",
  ...scenarioIds.map(id => `fixtures/integration/agave-4.0.0/controlled-experiment/${id}/summary/experiment-summary.json`),
  "fixtures/integration/agave-4.0.0/router-failover/router-evidence.json",
  "fixtures/sprint-7/intelligence-snapshot-evidence.json",
  "fixtures/sprint-10/devnet-accepted-run-20260814T220116Z/evidence.json",
];

const readJson = async path => JSON.parse(await readFile(resolve(root, path), "utf8"));
const manifest = await readJson(sourceFiles[0]);
const summaries = Object.fromEntries(await Promise.all(scenarioIds.map(async id => [
  id,
  await readJson(`fixtures/integration/agave-4.0.0/controlled-experiment/${id}/summary/experiment-summary.json`),
])));
const failoverEvidence = await readJson("fixtures/integration/agave-4.0.0/router-failover/router-evidence.json");
const feedEvidence = await readJson("fixtures/sprint-7/intelligence-snapshot-evidence.json");
const devnetEvidence = await readJson("fixtures/sprint-10/devnet-accepted-run-20260814T220116Z/evidence.json");

if (manifest.evidenceVersion !== "sprint-5-live-controlled-experiment@0.1.0") {
  throw new Error("unsupported controlled-experiment manifest");
}

const scenarios = scenarioIds.map(id => {
  const manifestScenario = manifest.scenarios[id];
  const summary = summaries[id];
  if (manifestScenario === undefined || summary === undefined) throw new Error(`missing scenario ${id}`);
  if (summary.inputHash !== manifestScenario.inputHash) throw new Error(`${id} summary input hash differs from manifest`);
  if (summary.policyVersion !== "ClassificationPolicyV0Experimental") throw new Error(`${id} uses unsupported policy`);
  const actual = summary.classifications.map(value => value.classification);
  if (JSON.stringify(actual) !== JSON.stringify(manifestScenario.actual)) throw new Error(`${id} classifications differ from manifest`);
  return {
    id,
    label: id === "insufficient_data" ? "INSUFFICIENT_DATA" : id.toUpperCase(),
    inputHash: summary.inputHash,
    signedResultCount: manifestScenario.signedResultCount,
    acknowledgedCount: manifestScenario.acknowledgedCount,
    rejectedCount: manifestScenario.rejectedCount,
    definition: summary.definition,
    classifications: summary.classifications,
    cells: summary.cells,
  };
});

const asymmetric = summaries.asymmetric;
const routeIntelligence = asymmetric.classifications.flatMap(classification => ["MATCHED_CONTROL", "PROGRAM_X"].map(transactionClass => {
  const cell = asymmetric.cells.find(value => value.routeId === classification.routeId && value.transactionClass === transactionClass);
  if (cell === undefined) throw new Error(`missing asymmetric cell for ${classification.routeId}/${transactionClass}`);
  return {
    routeId: classification.routeId,
    transactionClass,
    classification: classification.classification === "ASYMMETRIC" && transactionClass === "MATCHED_CONTROL"
      ? "HEALTHY"
      : classification.classification,
    evidenceStrength: classification.evidenceStrength,
    sampleCount: cell.completeCount,
    observedAt: feedEvidence.source_observed_at,
  };
}));

const routeAControl = routeIntelligence.find(value => value.routeId === "route-a" && value.transactionClass === "MATCHED_CONTROL");
const routeAProgramX = routeIntelligence.find(value => value.routeId === "route-a" && value.transactionClass === "PROGRAM_X");
if (routeIntelligence.length !== feedEvidence.entry_count || routeAControl?.classification !== feedEvidence.route_a_control || routeAProgramX?.classification !== feedEvidence.route_a_program_x) {
  throw new Error("derived dashboard intelligence differs from Sprint 7 evidence");
}

const dataset = {
  schemaVersion: "DashboardDataset@0.1.0",
  evidenceGeneratedAt: manifest.generatedAt,
  agaveVersion: manifest.agaveVersion,
  programAddress: manifest.programAddress,
  sourceFiles,
  overview: {
    scenarioCount: scenarios.length,
    routeCount: new Set(scenarios.flatMap(value => value.definition.routeIds)).size,
    observerCount: manifest.observerAllowlist.length,
    signedResultCount: scenarios.reduce((total, value) => total + value.signedResultCount, 0),
  },
  observers: manifest.observerAllowlist,
  observationLimitation: manifest.observationLimitation,
  scenarios,
  feed: {
    version: feedEvidence.snapshot_version,
    generatedAt: feedEvidence.snapshot_generated_at,
    expiresAt: feedEvidence.snapshot_expires_at,
    inputHash: feedEvidence.snapshot_input_hash,
    policyId: "ClassificationPolicyV0Experimental@0.1.0",
    dispositionAfterOneSnapshot: feedEvidence.disposition_after_one_snapshot,
    routeIntelligence,
  },
  failover: {
    evidenceVersion: failoverEvidence.evidenceVersion,
    generatedAt: failoverEvidence.generatedAt,
    transactionSignature: failoverEvidence.transactionSignature,
    finalState: failoverEvidence.result.finalState,
    confirmationObservedAfterRouteId: failoverEvidence.result.confirmationObservedAfterRouteId,
    attempts: failoverEvidence.result.attempts,
    observationIndependence: failoverEvidence.observationIndependence,
    primaryFailureMode: failoverEvidence.primaryFailureMode,
  },
  devnetProof: {
    evidenceVersion: devnetEvidence.evidenceVersion,
    generatedAt: devnetEvidence.generatedAt,
    scope: devnetEvidence.scope,
    transactionSignature: devnetEvidence.transactionSignature,
    explorerUrl: `https://explorer.solana.com/tx/${devnetEvidence.transactionSignature}?cluster=devnet`,
    lifecycle: devnetEvidence.lifecycle,
    quorum: {
      required: devnetEvidence.observationQuorum.required,
      logicalReaderCount: devnetEvidence.observationQuorum.logicalReaderCount,
      finalizedReaderIds: devnetEvidence.quorum.finalizedReaderIds,
      operationalIndependence: devnetEvidence.observationQuorum.operationalIndependence,
    },
  },
};

const outputDirectory = resolve(root, "apps/dashboard/public");
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "dashboard-data.json"), `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ generated: true, scenarios: scenarios.length, routes: dataset.overview.routeCount, signedResults: dataset.overview.signedResultCount })}\n`);
