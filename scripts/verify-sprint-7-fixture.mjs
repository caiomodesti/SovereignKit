import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { IntelligenceSnapshotClient, buildIntelligenceSnapshot } from "../packages/sdk/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const summary = JSON.parse(await readFile(resolve(root, "fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/summary/experiment-summary.json"), "utf8"));
const rawResults = (await readFile(resolve(root, "fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/raw/probe-results.jsonl"), "utf8"))
  .trimEnd().split("\n").map(line => JSON.parse(line));
const observedAt = rawResults.map(result => result.observer_wall_time).sort().at(-1);
if (observedAt === undefined) throw new Error("asymmetric fixture has no source observation time");
const evidence = JSON.parse(await readFile(resolve(root, "fixtures/sprint-7/intelligence-snapshot-evidence.json"), "utf8"));
const generated = buildIntelligenceSnapshot({
  version: 1,
  generatedAt: new Date("2026-08-14T00:00:00.000Z"),
  ttlMs: 60_000,
  summaries: [{ ...summary, observedAt }],
});
const control = generated.route_intelligence.find(value => value.route_id === "route-a" && value.transaction_class === "MATCHED_CONTROL");
const programX = generated.route_intelligence.find(value => value.route_id === "route-a" && value.transaction_class === "PROGRAM_X");
if (observedAt !== evidence.source_observed_at || generated.version !== evidence.snapshot_version ||
    generated.generated_at !== evidence.snapshot_generated_at || generated.expires_at !== evidence.snapshot_expires_at ||
    generated.input_hash !== evidence.snapshot_input_hash || generated.route_intelligence.length !== evidence.entry_count ||
    control?.classification !== evidence.route_a_control || programX?.classification !== evidence.route_a_program_x) {
  throw new Error("Sprint 7 intelligence fixture is not reproducible");
}

const client = new IntelligenceSnapshotClient({ pollTimeoutMs: 100, fetchSnapshot: async () => generated });
const fixtureNow = new Date("2026-08-14T00:00:01.000Z");
const poll = await client.poll(fixtureNow);
if (poll.status !== "APPLIED") throw new Error(`fixture was not applied: ${JSON.stringify(poll)}`);
if (client.disposition("route-a", "PROGRAM_X", fixtureNow) !== "LOCAL_PRIMARY_FALLBACK") throw new Error("one snapshot must not cross the avoid hysteresis threshold");
if (client.disposition("route-a", "PROGRAM_X", fixtureNow) !== evidence.disposition_after_one_snapshot) throw new Error("fixture disposition differs from retained evidence");
process.stdout.write(`${JSON.stringify({ reproduced: true, version: generated.version, entries: generated.route_intelligence.length, sourceObservedAt: observedAt, inputHash: generated.input_hash, firstPoll: poll.status, dispositionAfterOneSnapshot: client.disposition("route-a", "PROGRAM_X", fixtureNow) })}\n`);
