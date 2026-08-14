import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const datasetPath = resolve(root, "apps/dashboard/public/dashboard-data.json");
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));

if (dataset.schemaVersion !== "DashboardDataset@0.1.0") throw new Error("unexpected dashboard dataset schema");
if (dataset.overview.scenarioCount !== 4 || dataset.overview.routeCount !== 3 || dataset.overview.observerCount !== 1 || dataset.overview.signedResultCount !== 600) {
  throw new Error("dashboard overview differs from accepted controlled evidence");
}
if (dataset.scenarios.map(value => value.label).join(",") !== "HEALTHY,DEGRADED,ASYMMETRIC,INSUFFICIENT_DATA") {
  throw new Error("dashboard does not preserve all required experimental outcomes");
}
if (dataset.observationLimitation.includes("not infrastructure independence") === false) throw new Error("dashboard omits observation independence limitation");
if (dataset.feed.routeIntelligence.length !== 6 || dataset.feed.policyId !== "ClassificationPolicyV0Experimental@0.1.0") throw new Error("dashboard feed provenance is incomplete");
if (Date.parse(dataset.feed.expiresAt) <= Date.parse(dataset.feed.generatedAt)) throw new Error("dashboard feed interval is invalid");
if (dataset.failover.finalState !== "CONFIRMED" || dataset.failover.attempts[0]?.submissionOutcome !== "RPC_REJECTED" || dataset.failover.attempts[1]?.submissionOutcome !== "RPC_ACKNOWLEDGED") {
  throw new Error("dashboard failover evidence is incomplete");
}

for (const sourceFile of dataset.sourceFiles) await access(resolve(root, sourceFile));
for (const scenario of dataset.scenarios) {
  const source = JSON.parse(await readFile(resolve(root, `fixtures/integration/agave-4.0.0/controlled-experiment/${scenario.id}/summary/experiment-summary.json`), "utf8"));
  if (source.inputHash !== scenario.inputHash || JSON.stringify(source.cells) !== JSON.stringify(scenario.cells) || JSON.stringify(source.classifications) !== JSON.stringify(scenario.classifications)) {
    throw new Error(`dashboard transformed ${scenario.id} measurement evidence`);
  }
}

await access(resolve(root, "apps/dashboard/dist/index.html"));
const source = await readFile(resolve(root, "apps/dashboard/src/App.tsx"), "utf8");
for (const forbidden of ["censorship detected", "provider censored", "validator rejected intentionally"]) {
  if (source.toLowerCase().includes(forbidden)) throw new Error(`dashboard contains forbidden epistemic claim: ${forbidden}`);
}

process.stdout.write(`${JSON.stringify({ verified: true, schemaVersion: dataset.schemaVersion, scenarios: 4, routes: 3, signedResults: 600, feedStateAtVerification: Date.now() >= Date.parse(dataset.feed.expiresAt) ? "STALE" : "FRESH" })}\n`);
