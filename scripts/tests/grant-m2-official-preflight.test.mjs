import assert from "node:assert/strict";
import test from "node:test";

import { validateGrantM2OfficialPreflight } from "../lib/grant-m2-official-preflight.mjs";
import { GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 } from "../lib/grant-m2-official-schedule.mjs";

const source = "a".repeat(40);
const ids = ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"];
const valid = {
  schema_version: "GrantM2OfficialPreflight@0.1.0", status: "PASS_NOT_STARTED", captured_at: "2026-09-14T04:00:00.000Z",
  source_commit: source, precommitment_sha256: GRANT_M2_FROZEN_PRECOMMITMENT_SHA256, network: "solana-devnet",
  genesis_hash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  collector: { origin: "https://collector.sovereignkit.org", tls_valid: true, ready: true, stored_count: 12 },
  coordinator: { runtime_ready: true, durable_restart_enabled: true, single_writer_lock_available: true, clock_synchronized: true, clock_absolute_offset_ms: 10, disk_free_bytes: 10 * 1024 ** 3 },
  resources: { authenticated_quota_refreshed: true, zero_incremental_spend_only: true, frozen_workload_fits_free_quota: true, alchemy_remaining_compute_units: 20_000_000, devnet_fee_payer_balance_verified: true, devnet_fee_payer_balance_sufficient: true },
  observer_initial_sequences: { "observer-aws-a": 10, "observer-google-e2-micro": 20, "observer-oracle-a1": 30 },
  observers: ids.map((observer_id, index) => ({ observer_id, m2_runtime_commit: source, service_active: true, ready: true, reported_observer_id: observer_id, delivery_queue_count: 0, monitor_timer_active: true, official_controls_installed: true, official_worker_instances: 0, official_quota_journal_empty: true, clock_synchronized: true, clock_absolute_offset_ms: index, memory_available_bytes: 700 * 1024 ** 2, disk_free_bytes: 10 * 1024 ** 3 })),
  worker_instances_started: 0, official_window_started: false,
};

test("passes only a complete immediate preflight without starting M2", () => {
  const result = validateGrantM2OfficialPreflight(valid, source);
  assert.equal(result.status, "PASS");
  assert.equal(result.observers, 3);
  assert.equal(result.officialWindowStarted, false);
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
});

test("rejects stale runtime identity, delivery backlog, active workers and resource shortfall", () => {
  for (const mutate of [
    value => { value.observers[0].m2_runtime_commit = "b".repeat(40); },
    value => { value.observers[1].delivery_queue_count = 1; },
    value => { value.observers[2].official_worker_instances = 1; },
    value => { value.resources.alchemy_remaining_compute_units = 5_854_463; },
    value => { value.coordinator.durable_restart_enabled = false; },
  ]) {
    const changed = structuredClone(valid); mutate(changed);
    assert.throws(() => validateGrantM2OfficialPreflight(changed, source), /preflight/u);
  }
});

test("rejects start-state overclaims and incomplete observer sequences", () => {
  assert.throws(() => validateGrantM2OfficialPreflight({ ...valid, official_window_started: true }, source), /overstates/u);
  assert.throws(() => validateGrantM2OfficialPreflight({ ...valid, observer_initial_sequences: { "observer-aws-a": 1 } }, source), /sequences/u);
});
