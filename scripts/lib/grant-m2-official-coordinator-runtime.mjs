import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const GRANT_M2_OFFICIAL_COORDINATOR_CONFIG_VERSION = "GrantM2OfficialCoordinatorConfig@0.1.0";
export const GRANT_M2_OFFICIAL_COORDINATOR_STATE_VERSION = "GrantM2OfficialCoordinatorState@0.1.0";
export const GRANT_M2_OFFICIAL_OBSERVERS = ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"];

export async function loadGrantM2OfficialCoordinatorConfig(path) {
  const configPath = resolve(path);
  const value = JSON.parse(await readFile(configPath, "utf8"));
  validateGrantM2OfficialCoordinatorConfig(value);
  return { ...structuredClone(value), config_path: configPath };
}

export function validateGrantM2OfficialCoordinatorConfig(value) {
  if (value?.schema_version !== GRANT_M2_OFFICIAL_COORDINATOR_CONFIG_VERSION || value.status !== "CONFIGURED_NOT_STARTED" ||
      value.official_window_started !== false || !absolutePath(value.run_path) || !absolutePath(value.quota_path) ||
      !absolutePath(value.run_directory) || !absolutePath(value.journal_directory) || !absolutePath(value.evidence_directory) ||
      !absolutePath(value.observer_keys_path) || !absolutePath(value.fee_payer_path) ||
      !absolutePath(value.assignment_authority_private_path) || !absolutePath(value.assignment_authority_public_path) ||
      !absolutePath(value.alchemy_endpoint_path) || !absolutePath(value.public_endpoint_path) ||
      !absolutePath(value.observer_allowlist_path) || !absolutePath(value.assignment_authorities_path) ||
      !absolutePath(value.probe_result_schema_path) || !absolutePath(value.collector_accepted_log_path) || !absolutePath(value.telegram_path) ||
      !Array.isArray(value.observers) || value.observers.length !== GRANT_M2_OFFICIAL_OBSERVERS.length ||
      new Set(value.observers.map(observer => observer?.observer_id)).size !== GRANT_M2_OFFICIAL_OBSERVERS.length) {
    throw new Error("M2 official coordinator configuration envelope is invalid");
  }
  for (const observerId of GRANT_M2_OFFICIAL_OBSERVERS) {
    const observer = value.observers.find(candidate => candidate.observer_id === observerId);
    if (!observer || !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/u.test(observer.ssh_target ?? "") ||
        !absolutePath(observer.ssh_private_key_path) || !absolutePath(observer.known_hosts_path) ||
        !absolutePath(observer.observer_private_key_path) ||
        observer.runtime_root !== "/opt/sovereignkit-m2-rehearsal" ||
        observer.inbox_root !== "/var/lib/sovereignkit/m2/inbox" ||
        observer.spool_root !== "/var/lib/sovereignkit/spool" ||
        observer.raw_root !== "/var/lib/sovereignkit/evidence/m2/raw" ||
        observer.completion_root !== "/var/lib/sovereignkit/evidence/m2/completed" ||
        observer.delivery_log_path !== "/var/lib/sovereignkit/evidence/observer-delivery.jsonl") {
      throw new Error(`M2 official coordinator observer transport is invalid for ${observerId}`);
    }
  }
  return true;
}

export function createGrantM2OfficialMissingEvent(slot, recordedAt) {
  return terminalBase(slot, recordedAt, { terminal_status: "MISSING", result_id: null, reason: "MISSED_WITHOUT_BACKFILL" });
}

export function createGrantM2OfficialInvalidEvent(slot, recordedAt, reason) {
  if (typeof reason !== "string" || !/^[A-Z][A-Z0-9_]{2,127}$/u.test(reason)) throw new Error("M2 official invalid reason is unsafe");
  return terminalBase(slot, recordedAt, { terminal_status: "INVALID", reason });
}

export function createGrantM2OfficialEndEvent(run, state, recordedAt) {
  return {
    event: "WINDOW_ENDED",
    recorded_at: canonicalTimestamp(recordedAt),
    counts: structuredClone(state.counts),
    elapsed_seconds: Math.floor((Date.parse(recordedAt) - Date.parse(run.schedule.start_at)) / 1_000),
    official_window_completed: true,
    acceptance_automatically_declared: false,
  };
}

export function coordinatorSimplePortugueseSummary({ state, run, headline }) {
  const counts = state.counts ?? { QUALIFYING: 0, REJECTED: 0, MISSING: 0, INVALID: 0 };
  const accounted = counts.QUALIFYING + counts.REJECTED + counts.MISSING + counts.INVALID;
  const remaining = Math.max(0, run.schedule.planned_units - accounted);
  return `${headline}\nResumo simples: ${counts.QUALIFYING} válidas, ${counts.MISSING} perdidas, ${counts.INVALID + counts.REJECTED} com problema e ${remaining} ainda pendentes de ${run.schedule.planned_units}.`;
}

export function canonicalCoordinatorTimestamp(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("M2 official coordinator clock is invalid");
  return now.toISOString();
}

function terminalBase(slot, recordedAt, extra) {
  if (!slot || !/^[a-f0-9]{64}$/u.test(slot.slot_id ?? "")) throw new Error("M2 official terminal slot is invalid");
  return {
    event: "SLOT_TERMINAL",
    recorded_at: canonicalTimestamp(recordedAt),
    slot_id: slot.slot_id,
    cycle_index: slot.cycle_index,
    observer_id: slot.observer_id,
    route_id: slot.route_id,
    qualifying_units: 0,
    ...extra,
  };
}

function absolutePath(value) { return typeof value === "string" && value.startsWith("/") && !value.includes("\0"); }
function canonicalTimestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) throw new Error("canonical UTC timestamp required");
  return value;
}
