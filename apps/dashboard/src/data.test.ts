import { describe, expect, it, vi } from "vitest";

import datasetJson from "../public/dashboard-data.json";
import { evaluateFeedHealth, loadDashboardData, validateDashboardDataset } from "./data";
import type { DashboardDataset } from "./types";

const dataset = datasetJson as unknown as DashboardDataset;

describe("dashboard evidence adapter", () => {
  it("accepts the generated controlled dataset", () => {
    expect(validateDashboardDataset(dataset)).toBe(dataset);
    expect(dataset.overview).toEqual({ scenarioCount: 4, routeCount: 3, observerCount: 1, signedResultCount: 600 });
  });

  it("distinguishes fresh, stale, and temporally invalid feed evidence", () => {
    expect(evaluateFeedHealth(dataset.feed, new Date("2026-08-14T00:00:30.000Z"))).toBe("FRESH");
    expect(evaluateFeedHealth(dataset.feed, new Date("2026-08-14T00:01:00.000Z"))).toBe("STALE");
    expect(evaluateFeedHealth(dataset.feed, new Date("2026-08-13T23:59:59.000Z"))).toBe("INVALID");
  });

  it("fails explicitly when the evidence endpoint is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("offline", { status: 503 }));
    await expect(loadDashboardData(fetcher)).rejects.toThrow("HTTP 503");
  });

  it("rejects incomplete evidence instead of rendering invented defaults", () => {
    expect(() => validateDashboardDataset({ ...dataset, scenarios: [] })).toThrow("four scenarios");
    expect(() => validateDashboardDataset({ ...dataset, devnetProof: { ...dataset.devnetProof, lifecycle: [] } })).toThrow("Devnet evidence");
  });
});
