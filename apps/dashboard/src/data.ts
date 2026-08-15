import type { DashboardDataset } from "./types";

export type FeedHealth = "FRESH" | "STALE" | "INVALID";

export function evaluateFeedHealth(feed: DashboardDataset["feed"], now = new Date()): FeedHealth {
  const generatedAt = Date.parse(feed.generatedAt);
  const expiresAt = Date.parse(feed.expiresAt);
  const nowMs = now.getTime();
  if (![generatedAt, expiresAt, nowMs].every(Number.isFinite) || expiresAt <= generatedAt || nowMs < generatedAt) return "INVALID";
  return nowMs >= expiresAt ? "STALE" : "FRESH";
}

export function validateDashboardDataset(value: unknown): DashboardDataset {
  if (typeof value !== "object" || value === null) throw new Error("dashboard dataset must be an object");
  const dataset = value as Partial<DashboardDataset>;
  if (dataset.schemaVersion !== "DashboardDataset@0.1.0") throw new Error("unsupported dashboard dataset schema");
  if (!Array.isArray(dataset.scenarios) || dataset.scenarios.length !== 4) throw new Error("dashboard dataset must contain four scenarios");
  if (!Array.isArray(dataset.observers) || dataset.observers.length === 0) throw new Error("dashboard dataset has no observers");
  if (dataset.overview?.signedResultCount !== 600 || dataset.overview.routeCount !== 3) throw new Error("dashboard evidence totals differ from the accepted controlled run");
  if (!Array.isArray(dataset.sourceFiles) || dataset.sourceFiles.length < 7) throw new Error("dashboard dataset provenance is incomplete");
  const expectedScenarios = ["healthy", "degraded", "asymmetric", "insufficient_data"];
  if (dataset.scenarios.some((scenario, index) => typeof scenario !== "object" || scenario === null || scenario.id !== expectedScenarios[index] || !Array.isArray(scenario.cells) || !Array.isArray(scenario.classifications))) throw new Error("dashboard scenario evidence is incomplete");
  if (!Array.isArray(dataset.feed?.routeIntelligence) || dataset.feed.routeIntelligence.length !== 6) throw new Error("dashboard intelligence evidence is incomplete");
  if (!Array.isArray(dataset.failover?.attempts) || dataset.failover.attempts.length !== 2) throw new Error("dashboard failover evidence is incomplete");
  if (typeof dataset.devnetProof?.transactionSignature !== "string" || dataset.devnetProof.transactionSignature.length < 80 ||
      !Array.isArray(dataset.devnetProof.lifecycle) || dataset.devnetProof.lifecycle.at(-1) !== "FINALIZED" ||
      dataset.devnetProof.quorum?.required !== 2 || dataset.devnetProof.quorum.logicalReaderCount !== 3) {
    throw new Error("dashboard Devnet evidence is incomplete");
  }
  return dataset as DashboardDataset;
}

export async function loadDashboardData(fetcher: typeof fetch = fetch): Promise<DashboardDataset> {
  const response = await fetcher("./dashboard-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`evidence request failed with HTTP ${response.status}`);
  return validateDashboardDataset(await response.json());
}
