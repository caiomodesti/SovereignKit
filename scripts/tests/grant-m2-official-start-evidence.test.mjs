import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixture = JSON.parse(await readFile("fixtures/grant-m2/official-replacement-start-20260915.json", "utf8"));

test("official replacement start evidence is balanced and does not overclaim completion", () => {
  assert.equal(fixture.schema_version, "GrantM2OfficialReplacementStart@0.1.0");
  assert.equal(fixture.window.planned_cycles, 672);
  assert.equal(fixture.window.planned_units, 4032);
  assert.equal(fixture.window.automatic_backfill, false);
  assert.equal(fixture.initial_snapshot.completed_cycles * 6, fixture.initial_snapshot.terminal_slots);
  assert.equal(Object.values(fixture.initial_snapshot.counts).reduce((sum, count) => sum + count, 0), fixture.initial_snapshot.terminal_slots);
  assert.equal(fixture.initial_snapshot.counts.QUALIFYING, 18);
  assert.equal(fixture.initial_snapshot.distribution.qualifying_per_observer * 3, 18);
  assert.equal(fixture.initial_snapshot.distribution.qualifying_alchemy_route + fixture.initial_snapshot.distribution.qualifying_public_route, 18);
  assert.equal(fixture.claim_boundaries.official_window_started, true);
  assert.equal(fixture.claim_boundaries.fourteen_day_window_complete, false);
  assert.equal(fixture.claim_boundaries.final_reconciliation_complete, false);
  assert.equal(fixture.claim_boundaries.milestone_2_complete, false);
  assert.equal(fixture.claim_boundaries.future_error_free_operation_guaranteed, false);
});
