import { mkdir, open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { grantM2OfficialScheduleHash, validateGrantM2OfficialSchedule } from "./grant-m2-official-schedule.mjs";
import { validateGrantM2OfficialRun } from "./grant-m2-official-run.mjs";

export const GRANT_M2_OFFICIAL_EVENT_VERSION = "GrantM2OfficialEvent@0.1.0";
const TERMINAL_STATES = new Set(["QUALIFYING", "REJECTED", "MISSING", "INVALID"]);
const OBSERVATION_TERMINAL_STATES = new Set(["FINALIZED", "CONFIRMED", "OBSERVED_EXECUTION_FAILED", "EXPIRED", "OBSERVATION_INCONCLUSIVE"]);

export async function initializeGrantM2OfficialJournal({ directory, run, quota }) {
  validateGrantM2OfficialRun(run, quota);
  await mkdir(join(directory, "events"), { recursive: true });
  const manifestPath = join(directory, "run.json");
  const expected = `${JSON.stringify(run)}\n`;
  try { await writeOnce(manifestPath, expected); }
  catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (await readFile(manifestPath, "utf8") !== expected) throw new Error("M2 official journal run binding changed");
  }
  return loadGrantM2OfficialJournal({ directory, run, quota });
}

export async function loadGrantM2OfficialJournal({ directory, run, quota }) {
  validateGrantM2OfficialRun(run, quota);
  const expectedManifest = `${JSON.stringify(run)}\n`;
  if (await readFile(join(directory, "run.json"), "utf8") !== expectedManifest) throw new Error("M2 official journal run binding changed");
  const names = (await readdir(join(directory, "events"))).sort();
  if (names.some(name => !/^event-\d{6}\.json$/u.test(name))) throw new Error("M2 official journal contains an unexpected entry");
  const records = [];
  for (let index = 0; index < names.length; index += 1) {
    if (names[index] !== eventName(index)) throw new Error("M2 official journal sequence has a gap");
    const text = await readFile(join(directory, "events", names[index]), "utf8");
    if (!text.endsWith("\n")) throw new Error("M2 official journal contains a partial event");
    let record;
    try { record = JSON.parse(text); } catch { throw new Error("M2 official journal contains invalid JSON"); }
    validateEvent(record, records, run);
    if (text !== `${JSON.stringify(record)}\n`) throw new Error("M2 official journal event is not canonical");
    records.push(record);
  }
  return summarize(records, run);
}

export async function appendGrantM2OfficialEvent({ directory, run, quota, event }) {
  const state = await loadGrantM2OfficialJournal({ directory, run, quota });
  const record = {
    schema_version: GRANT_M2_OFFICIAL_EVENT_VERSION,
    sequence: state.records.length,
    schedule_sha256: grantM2OfficialScheduleHash(run.schedule),
    ...event,
  };
  validateEvent(record, state.records, run);
  await writeOnce(join(directory, "events", eventName(record.sequence)), `${JSON.stringify(record)}\n`);
  return loadGrantM2OfficialJournal({ directory, run, quota });
}

export function decideGrantM2OfficialDueSlots({ run, records, nowAt }) {
  const now = canonicalTime(nowAt);
  if (!Array.isArray(records)) throw new Error("M2 official records are required");
  const completed = new Set(records.filter(record => record.event === "SLOT_TERMINAL").map(record => record.slot_id));
  return run.schedule.slots
    .filter(slot => !completed.has(slot.slot_id) && canonicalTime(slot.due_at) <= now)
    .map(slot => ({
      slot,
      decision: now - canonicalTime(slot.due_at) <= run.schedule.slot_lateness_tolerance_ms ? "DUE" : "MISSING",
    }));
}

function validateEvent(record, previous, run) {
  if (record?.schema_version !== GRANT_M2_OFFICIAL_EVENT_VERSION || record.sequence !== previous.length ||
      record.schedule_sha256 !== grantM2OfficialScheduleHash(run.schedule)) throw new Error("M2 official event envelope is invalid");
  const recorded = canonicalTime(record.recorded_at);
  if (previous.length > 0 && recorded < canonicalTime(previous.at(-1).recorded_at)) throw new Error("M2 official event clock moved backwards");
  if (record.event === "WINDOW_STARTED") {
    if (previous.length !== 0 || record.run_id !== run.run_id || record.official_window_started !== true || record.milestone_2_started !== true ||
        record.preflight_sha256 !== run.authorization.preflight_sha256 || recorded < canonicalTime(run.schedule.start_at) ||
        recorded > canonicalTime(run.schedule.start_at) + run.schedule.slot_lateness_tolerance_ms) {
      throw new Error("M2 official start event is invalid");
    }
    return;
  }
  if (previous[0]?.event !== "WINDOW_STARTED") throw new Error("M2 official slot or end event predates the window start");
  if (record.event === "SLOT_TERMINAL") {
    const slot = run.schedule.slots.find(candidate => candidate.slot_id === record.slot_id);
    const duplicate = previous.some(candidate => candidate.event === "SLOT_TERMINAL" && candidate.slot_id === record.slot_id);
    if (!slot || duplicate || !TERMINAL_STATES.has(record.terminal_status) || record.cycle_index !== slot.cycle_index ||
        record.observer_id !== slot.observer_id || record.route_id !== slot.route_id || recorded < canonicalTime(slot.due_at)) {
      throw new Error("M2 official slot terminal event is invalid or duplicated");
    }
    if (record.terminal_status === "MISSING") {
      if (record.qualifying_units !== 0 || record.result_id !== null || record.reason !== "MISSED_WITHOUT_BACKFILL" ||
          recorded <= canonicalTime(slot.due_at) + run.schedule.slot_lateness_tolerance_ms) {
        throw new Error("M2 missing slot does not preserve the no-backfill rule");
      }
      return;
    }
    if (record.terminal_status === "QUALIFYING") {
      if (record.qualifying_units !== 1 || typeof record.result_id !== "string" || typeof record.signature !== "string" ||
          !OBSERVATION_TERMINAL_STATES.has(record.observation_terminal_state) ||
          !/^[a-f0-9]{64}$/u.test(record.raw_sha256 ?? "") || !/^[a-f0-9]{64}$/u.test(record.signed_result_sha256 ?? "") ||
          !/^[a-f0-9]{64}$/u.test(record.delivery_receipt_sha256 ?? "") || !/^[a-f0-9]{64}$/u.test(record.collector_record_sha256 ?? "") ||
          record.collector_status !== "ACCEPTED" || record.raw_to_derived_recomputed !== true ||
          record.observer_signature_verified !== true || record.collector_receipt_bound !== true) {
        throw new Error("M2 qualifying slot lacks complete semantic evidence");
      }
      return;
    }
    if (record.qualifying_units !== 0 || typeof record.reason !== "string" || record.reason.length < 3) {
      throw new Error("M2 non-qualifying slot is not explicitly explained");
    }
    return;
  }
  if (record.event === "WINDOW_ENDED") {
    const terminals = previous.filter(candidate => candidate.event === "SLOT_TERMINAL");
    const counts = countStatuses(terminals);
    if (previous.some(candidate => candidate.event === "WINDOW_ENDED") || recorded < canonicalTime(run.schedule.end_at) ||
        terminals.length !== run.schedule.planned_units || JSON.stringify(record.counts) !== JSON.stringify(counts) ||
        record.elapsed_seconds < run.schedule.real_window_seconds || record.official_window_completed !== true ||
        record.acceptance_automatically_declared !== false) throw new Error("M2 official end event is incomplete or overstated");
    return;
  }
  throw new Error("M2 official event type is unsupported");
}

function summarize(records, run) {
  const terminals = records.filter(record => record.event === "SLOT_TERMINAL");
  const counts = countStatuses(terminals);
  return {
    records,
    started: records[0]?.event === "WINDOW_STARTED",
    ended: records.some(record => record.event === "WINDOW_ENDED"),
    terminalSlotIds: new Set(terminals.map(record => record.slot_id)),
    counts,
    accountedUnits: terminals.length,
    plannedUnits: run.schedule.planned_units,
  };
}

function countStatuses(records) {
  return records.reduce((counts, record) => {
    counts[record.terminal_status] += 1;
    return counts;
  }, { QUALIFYING: 0, REJECTED: 0, MISSING: 0, INVALID: 0 });
}
function eventName(sequence) { return `event-${String(sequence).padStart(6, "0")}.json`; }
async function writeOnce(path, text) {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(text, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}
function canonicalTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) throw new Error("canonical UTC timestamp required");
  return parsed;
}
