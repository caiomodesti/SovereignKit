import { decideGrantM2OfficialDueSlots } from "./grant-m2-official-journal.mjs";
import { validateGrantM2OfficialRun } from "./grant-m2-official-run.mjs";

export function planGrantM2OfficialCoordinator({ run, quota, records, nowAt, activeAssignments = [] }) {
  validateGrantM2OfficialRun(run, quota);
  const now = canonicalTime(nowAt);
  if (!Array.isArray(records) || !Array.isArray(activeAssignments)) throw new Error("M2 official coordinator state is invalid");
  const starts = records.filter(record => record?.event === "WINDOW_STARTED");
  const ends = records.filter(record => record?.event === "WINDOW_ENDED");
  if (starts.length > 1 || ends.length > 1 || (ends.length === 1 && starts.length !== 1)) throw new Error("M2 official coordinator journal lifecycle is invalid");
  if (ends.length === 1) return { status: "COMPLETED", actions: [], next_wake_at: null };

  const start = canonicalTime(run.schedule.start_at);
  if (starts.length === 0) {
    if (records.length !== 0) throw new Error("M2 official coordinator has events before window start");
    if (now < start) return { status: "WAITING_TO_START", actions: [], next_wake_at: run.schedule.start_at };
    if (now <= start + run.schedule.slot_lateness_tolerance_ms) {
      return { status: "START_DUE", actions: [{ type: "START_WINDOW", recorded_at: nowAt }], next_wake_at: nowAt };
    }
    return { status: "BLOCKED_START_MISSED", actions: [], next_wake_at: null };
  }

  const activeByObserver = validateActiveAssignments(activeAssignments, run);
  const due = decideGrantM2OfficialDueSlots({ run, records, nowAt });
  const actions = [];
  const claimedObservers = new Set();
  for (const item of due) {
    if (item.decision === "MISSING") {
      actions.push({ type: "RECORD_MISSING", slot: item.slot, recorded_at: nowAt, reason: "MISSED_WITHOUT_BACKFILL" });
      continue;
    }
    if (activeByObserver.has(item.slot.observer_id) || claimedObservers.has(item.slot.observer_id)) {
      actions.push({ type: "WAIT_FOR_ACTIVE_OBSERVER", slot: item.slot, assignment_id: activeByObserver.get(item.slot.observer_id) ?? null });
      continue;
    }
    claimedObservers.add(item.slot.observer_id);
    actions.push({ type: "EXECUTE_SLOT", slot: item.slot, recorded_at: nowAt });
  }

  const accounted = new Set(records.filter(record => record?.event === "SLOT_TERMINAL").map(record => record.slot_id));
  if (accounted.size === run.schedule.planned_units && now >= canonicalTime(run.schedule.end_at) && activeAssignments.length === 0) {
    actions.push({ type: "END_WINDOW", recorded_at: nowAt });
  }
  const nextSlot = run.schedule.slots.find(slot => !accounted.has(slot.slot_id) && canonicalTime(slot.due_at) > now);
  return {
    status: actions.length === 0 ? "WAITING" : "ACTION_REQUIRED",
    actions,
    next_wake_at: nextSlot?.due_at ?? (now < canonicalTime(run.schedule.end_at) ? run.schedule.end_at : null),
  };
}

function validateActiveAssignments(values, run) {
  const result = new Map();
  for (const value of values) {
    const slot = run.schedule.slots.find(candidate => candidate.slot_id === value?.slot_id);
    if (slot === undefined || value.observer_id !== slot.observer_id || typeof value.assignment_id !== "string" || value.assignment_id.length === 0 ||
        result.has(value.observer_id)) throw new Error("M2 official active assignment set is invalid or ambiguous");
    result.set(value.observer_id, value.assignment_id);
  }
  return result;
}

function canonicalTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) throw new Error("M2 official coordinator requires canonical UTC");
  return parsed;
}
