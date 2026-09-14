import { createHash } from "node:crypto";

import { GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 } from "./grant-m2-official-schedule.mjs";

export const GRANT_M2_OFFICIAL_PREFLIGHT_VERSION = "GrantM2OfficialPreflight@0.2.0";
const OBSERVERS = ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"];
const MINIMUM_DISK_BYTES = 5 * 1024 ** 3;
const MINIMUM_MEMORY_BYTES = 512 * 1024 ** 2;
const MAXIMUM_CLOCK_OFFSET_MS = 1_000;
const MAXIMUM_TRANSPORT_PROBE_AGE_MS = 900_000;

export function validateGrantM2OfficialPreflight(value, expectedSourceCommit) {
  if (value?.schema_version !== GRANT_M2_OFFICIAL_PREFLIGHT_VERSION || value.status !== "PASS_NOT_STARTED" ||
      !canonicalTimestamp(value.captured_at) || value.source_commit !== expectedSourceCommit || !/^[a-f0-9]{40}$/u.test(expectedSourceCommit ?? "") ||
      value.precommitment_sha256 !== GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 || value.network !== "solana-devnet" ||
      value.genesis_hash !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" || value.official_window_started !== false ||
      value.worker_instances_started !== 0) throw new Error("M2 official preflight envelope is invalid or overstates start state");
  const collector = value.collector ?? {};
  if (collector.origin !== "https://collector.sovereignkit.org" || collector.tls_valid !== true || collector.ready !== true ||
      !Number.isSafeInteger(collector.stored_count) || collector.stored_count < 0) throw new Error("M2 official Collector preflight failed");
  const coordinator = value.coordinator ?? {};
  if (coordinator.runtime_ready !== true || coordinator.durable_restart_enabled !== true || coordinator.single_writer_lock_available !== true ||
      coordinator.clock_synchronized !== true || !bounded(coordinator.clock_absolute_offset_ms, MAXIMUM_CLOCK_OFFSET_MS) ||
      !Number.isSafeInteger(coordinator.disk_free_bytes) || coordinator.disk_free_bytes < MINIMUM_DISK_BYTES) {
    throw new Error("M2 official coordinator preflight failed");
  }
  const resources = value.resources ?? {};
  if (resources.authenticated_quota_refreshed !== true || resources.zero_incremental_spend_only !== true || resources.frozen_workload_fits_free_quota !== true ||
      !Number.isSafeInteger(resources.alchemy_remaining_compute_units) || resources.alchemy_remaining_compute_units < 5_854_464 ||
      resources.devnet_fee_payer_balance_verified !== true || resources.devnet_fee_payer_balance_sufficient !== true) {
    throw new Error("M2 official free-quota or Devnet fee-payer preflight failed");
  }
  validateTransportProbe(value.transport_probe, value.captured_at, expectedSourceCommit);
  validateSequences(value.observer_initial_sequences);
  if (!Array.isArray(value.observers) || value.observers.length !== OBSERVERS.length ||
      new Set(value.observers.map(observer => observer?.observer_id)).size !== OBSERVERS.length) throw new Error("M2 official observer preflight set is invalid");
  for (const observerId of OBSERVERS) {
    const observer = value.observers.find(candidate => candidate.observer_id === observerId);
    if (observer?.m2_runtime_commit !== expectedSourceCommit || observer.service_active !== true || observer.ready !== true ||
        observer.reported_observer_id !== observerId || observer.delivery_queue_count !== 0 || observer.monitor_timer_active !== true ||
        observer.official_controls_installed !== true ||
        observer.official_worker_instances !== 0 || observer.official_quota_journal_empty !== true ||
        observer.clock_synchronized !== true || !bounded(observer.clock_absolute_offset_ms, MAXIMUM_CLOCK_OFFSET_MS) ||
        !Number.isSafeInteger(observer.memory_available_bytes) || observer.memory_available_bytes < MINIMUM_MEMORY_BYTES ||
        !Number.isSafeInteger(observer.disk_free_bytes) || observer.disk_free_bytes < MINIMUM_DISK_BYTES) {
      throw new Error(`M2 official observer preflight failed for ${observerId}`);
    }
  }
  return {
    status: "PASS",
    gate: "GRANT_M2_OFFICIAL_IMMEDIATE_PREFLIGHT",
    capturedAt: value.captured_at,
    observers: OBSERVERS.length,
    initialSequences: structuredClone(value.observer_initial_sequences),
    sha256: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    officialWindowStarted: false,
  };
}

function validateTransportProbe(value, preflightCapturedAt, expectedSourceCommit) {
  const probeCaptured = Date.parse(value?.captured_at);
  const preflightCaptured = Date.parse(preflightCapturedAt);
  if (value?.status !== "PASS" || !/^transport-probe-[a-z0-9-]+$/u.test(value.probe_id ?? "") ||
      !canonicalTimestamp(value.captured_at) || value.source_commit !== expectedSourceCommit ||
      value.transactions_submitted !== 0 || value.workers_started !== 0 || value.official_window_started !== false ||
      probeCaptured > preflightCaptured || preflightCaptured - probeCaptured > MAXIMUM_TRANSPORT_PROBE_AGE_MS ||
      !Array.isArray(value.observers) || value.observers.length !== OBSERVERS.length ||
      new Set(value.observers.map(observer => observer?.observer_id)).size !== OBSERVERS.length) {
    throw new Error("M2 official transport probe preflight failed");
  }
  for (const observerId of OBSERVERS) {
    const observer = value.observers.find(candidate => candidate.observer_id === observerId);
    if (observer?.status !== "PASS" || !/^[a-f0-9]{64}$/u.test(observer.receipt_sha256 ?? "") ||
        observer.transaction_submitted !== false || observer.worker_started !== false) {
      throw new Error(`M2 official transport probe preflight failed for ${observerId}`);
    }
  }
}

function validateSequences(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("\n") !== [...OBSERVERS].sort().join("\n") ||
      OBSERVERS.some(id => !Number.isSafeInteger(value[id]) || value[id] < 0)) throw new Error("M2 official preflight observer sequences are invalid");
}
function bounded(value, maximum) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum; }
function canonicalTimestamp(value) { const parsed = Date.parse(value); return Number.isSafeInteger(parsed) && new Date(parsed).toISOString() === value; }
