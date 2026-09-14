import { createHash } from "node:crypto";

import { validateGrantM2ResourceQuotaEstimate } from "./grant-m2-reader-quota-proposal.mjs";

export const GRANT_M2_OFFICIAL_SCHEDULE_VERSION = "GrantM2OfficialSchedule@0.1.0";
export const GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 = "9f83782ebc8ff031adfa643fb991826930946773c2f3d5d8c0a7e5a71902eaff";

const WINDOW_SECONDS = 1_209_600;
const CYCLE_SECONDS = 1_800;
const CYCLES = 672;
const UNITS_PER_CYCLE = 6;
const SLOT_LATE_TOLERANCE_MS = 120_000;

export function createGrantM2OfficialSchedule({ runId, startAt, quota, precommitmentSha256 }) {
  if (!/^[a-z0-9][a-z0-9_-]{2,79}$/u.test(runId ?? "")) throw new Error("M2 official run ID is invalid");
  const start = canonicalTime(startAt);
  validateGrantM2ResourceQuotaEstimate(quota);
  if (precommitmentSha256 !== GRANT_M2_FROZEN_PRECOMMITMENT_SHA256) {
    throw new Error("M2 official schedule is not bound to the frozen precommitment");
  }
  const slots = Array.from({ length: CYCLES }, (_, cycleIndex) =>
    quota.deterministic_cycle_offsets.map(offset => ({
      slot_id: sha256(`${runId}:${startAt}:${cycleIndex}:${offset.observer_id}:${offset.route_id}`),
      cycle_index: cycleIndex,
      observer_id: offset.observer_id,
      route_id: offset.route_id,
      due_at: new Date(start + cycleIndex * CYCLE_SECONDS * 1000 + offset.offset_seconds * 1000).toISOString(),
    })),
  ).flat();
  const schedule = {
    schema_version: GRANT_M2_OFFICIAL_SCHEDULE_VERSION,
    mode: "OFFICIAL_FROZEN_WINDOW",
    run_id: runId,
    start_at: startAt,
    end_at: new Date(start + WINDOW_SECONDS * 1000).toISOString(),
    real_window_seconds: WINDOW_SECONDS,
    cycle_seconds: CYCLE_SECONDS,
    planned_cycles: CYCLES,
    units_per_cycle: UNITS_PER_CYCLE,
    planned_units: CYCLES * UNITS_PER_CYCLE,
    minimum_qualifying_units: 3_000,
    slot_lateness_tolerance_ms: SLOT_LATE_TOLERANCE_MS,
    precommitment_sha256: precommitmentSha256,
    quota_sha256: sha256(JSON.stringify(quota)),
    backfill_missing_cycles: false,
    slots,
  };
  validateGrantM2OfficialSchedule(schedule, quota);
  return schedule;
}

export function validateGrantM2OfficialSchedule(schedule, quota) {
  validateGrantM2ResourceQuotaEstimate(quota);
  if (schedule?.schema_version !== GRANT_M2_OFFICIAL_SCHEDULE_VERSION || schedule.mode !== "OFFICIAL_FROZEN_WINDOW" ||
      !/^[a-z0-9][a-z0-9_-]{2,79}$/u.test(schedule.run_id ?? "") ||
      schedule.real_window_seconds !== WINDOW_SECONDS || schedule.cycle_seconds !== CYCLE_SECONDS ||
      schedule.planned_cycles !== CYCLES || schedule.units_per_cycle !== UNITS_PER_CYCLE ||
      schedule.planned_units !== CYCLES * UNITS_PER_CYCLE || schedule.minimum_qualifying_units !== 3_000 ||
      schedule.slot_lateness_tolerance_ms !== SLOT_LATE_TOLERANCE_MS || schedule.backfill_missing_cycles !== false ||
      schedule.precommitment_sha256 !== GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 ||
      schedule.quota_sha256 !== sha256(JSON.stringify(quota)) || schedule.slots?.length !== CYCLES * UNITS_PER_CYCLE ||
      new Set(schedule.slots.map(slot => slot.slot_id)).size !== CYCLES * UNITS_PER_CYCLE) {
    throw new Error("M2 official schedule envelope is invalid");
  }
  const start = canonicalTime(schedule.start_at);
  if (canonicalTime(schedule.end_at) - start !== WINDOW_SECONDS * 1000) throw new Error("M2 official window duration is invalid");
  for (let index = 0; index < schedule.slots.length; index += 1) {
    const cycleIndex = Math.floor(index / UNITS_PER_CYCLE);
    const offsetIndex = index % UNITS_PER_CYCLE;
    const expected = quota.deterministic_cycle_offsets[offsetIndex];
    const slot = schedule.slots[index];
    if (slot.cycle_index !== cycleIndex || slot.observer_id !== expected.observer_id || slot.route_id !== expected.route_id ||
        slot.slot_id !== sha256(`${schedule.run_id}:${schedule.start_at}:${cycleIndex}:${expected.observer_id}:${expected.route_id}`) ||
        canonicalTime(slot.due_at) !== start + cycleIndex * CYCLE_SECONDS * 1000 + expected.offset_seconds * 1000) {
      throw new Error(`M2 official schedule slot ${index} drifted from the frozen cadence`);
    }
  }
  return {
    status: "PASS",
    gate: "GRANT_M2_OFFICIAL_SCHEDULE",
    plannedCycles: CYCLES,
    plannedUnits: CYCLES * UNITS_PER_CYCLE,
    realWindowSeconds: WINDOW_SECONDS,
    backfillMissingCycles: false,
  };
}

export function grantM2OfficialScheduleHash(schedule) {
  return sha256(JSON.stringify(schedule));
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) throw new Error("canonical UTC timestamp required");
  return parsed;
}
