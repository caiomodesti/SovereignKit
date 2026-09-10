import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateGrantM2PilotPrecommitment } from "../lib/grant-m2-pilot-precommitment.mjs";

const canonical = JSON.parse(await readFile("deploy/grant-pilot/m2-pilot-precommitment.json", "utf8"));
const contents = new Map();
contents.set(canonical.m1_observer_registry.path, await readFile(canonical.m1_observer_registry.path, "utf8"));
for (const route of canonical.routes) contents.set(route.preflight_path, await readFile(route.preflight_path, "utf8"));
contents.set(canonical.route_candidate_failures.path, await readFile(canonical.route_candidate_failures.path, "utf8"));

test("accepts the frozen two-route precommitment without starting M2", () => {
  const result = validateGrantM2PilotPrecommitment(structuredClone(canonical), contents);
  assert.deepEqual(result, {
    status: "PASS",
    gate: "GRANT_M2_PILOT_PRECOMMITMENT",
    observers: 3,
    routes: 2,
    classes: 1,
    plannedUnits: 4032,
    targetMarginUnits: 1032,
    rejectedRouteCandidates: 3,
    milestone2Started: false,
  });
});

test("rejects observer identity or runtime drift from accepted M1", () => {
  const runtime = structuredClone(canonical);
  runtime.observers[0].runtime_commit = "a".repeat(40);
  assert.throws(() => validateGrantM2PilotPrecommitment(runtime, contents), /does not match accepted M1/u);

  const registry = new Map(contents);
  registry.set(canonical.m1_observer_registry.path, "{}\n");
  assert.throws(() => validateGrantM2PilotPrecommitment(structuredClone(canonical), registry), /registry hash mismatch/u);
});

test("rejects removal or rewriting of failed route candidates", () => {
  const missing = new Map(contents);
  missing.delete(canonical.route_candidate_failures.path);
  assert.throws(() => validateGrantM2PilotPrecommitment(structuredClone(canonical), missing), /candidate evidence hash mismatch/u);

  const rewritten = new Map(contents);
  rewritten.set(canonical.route_candidate_failures.path, JSON.stringify({ candidates: [] }));
  assert.throws(() => validateGrantM2PilotPrecommitment(structuredClone(canonical), rewritten), /candidate evidence hash mismatch/u);
});

test("rejects route evidence drift or provider relabeling", () => {
  const drift = new Map(contents);
  drift.set(canonical.routes[0].preflight_path, `${drift.get(canonical.routes[0].preflight_path)} `);
  assert.throws(() => validateGrantM2PilotPrecommitment(structuredClone(canonical), drift), /hash mismatch/u);

  const relabeled = structuredClone(canonical);
  relabeled.routes[0].provider_label = "Different provider";
  assert.throws(() => validateGrantM2PilotPrecommitment(relabeled, contents), /content mismatch/u);
});

test("rejects target, duration, cadence, or arithmetic weakening", () => {
  for (const mutate of [
    plan => { plan.cadence.minimum_qualifying_units = 2999; },
    plan => { plan.cadence.real_window_seconds -= 1; },
    plan => { plan.cadence.cycle_seconds = 3600; },
    plan => { plan.cadence.planned_units = 3000; },
  ]) {
    const plan = structuredClone(canonical);
    mutate(plan);
    assert.throws(() => validateGrantM2PilotPrecommitment(plan, contents), /cadence, duration, or unit arithmetic/u);
  }
});

test("rejects silent exclusions, retries as units, and class broadening", () => {
  const silent = structuredClone(canonical);
  silent.qualification.retain_all_missing_rejected_invalid_and_excluded = false;
  assert.throws(() => validateGrantM2PilotPrecommitment(silent, contents), /qualification rules/u);

  const retries = structuredClone(canonical);
  retries.qualification.count_retry_as_new_unit = true;
  assert.throws(() => validateGrantM2PilotPrecommitment(retries, contents), /qualification rules/u);

  const classScope = structuredClone(canonical);
  classScope.transaction_classes.push("PROGRAM_X");
  assert.throws(() => validateGrantM2PilotPrecommitment(classScope, contents), /scope is broadened/u);
});

test("rejects automatic restart, backfill, or official-window activation", () => {
  const reset = structuredClone(canonical);
  reset.interruption_policy.automatic_window_reset = true;
  assert.throws(() => validateGrantM2PilotPrecommitment(reset, contents), /interruption policy/u);

  const backfill = structuredClone(canonical);
  backfill.cadence.backfill_missing_cycles = true;
  assert.throws(() => validateGrantM2PilotPrecommitment(backfill, contents), /cadence/u);

  const started = structuredClone(canonical);
  started.official_window.authorization = "AUTHORIZED";
  started.official_window.started = true;
  started.milestone_2_started = true;
  assert.throws(() => validateGrantM2PilotPrecommitment(started, contents), /cannot authorize/u);
});
