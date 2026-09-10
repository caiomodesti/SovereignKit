import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { validateGrantM2ResourceQuotaEstimate } from './grant-m2-reader-quota-proposal.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const encode = value => JSON.stringify(value);
function timestamp(value) {
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms) || new Date(ms).toISOString() !== value) throw Error('Canonical UTC timestamp required');
  return ms;
}

// Planning and dry-run only. No RPC, subprocess, submission or live callback.
export function createRehearsalSchedule({ runId, startAt, quota }) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(runId ?? '')) throw Error('Invalid run ID');
  validateGrantM2ResourceQuotaEstimate(quota);
  const start = timestamp(startAt);
  const endAt = new Date(start + 3600000).toISOString();
  const slots = [0, 1].flatMap(cycle => quota.deterministic_cycle_offsets.map(entry => ({
    slot_id: digest(`${runId}:${startAt}:${cycle}:${entry.observer_id}:${entry.route_id}`),
    cycle_index: cycle,
    observer_id: entry.observer_id,
    route_id: entry.route_id,
    due_at: new Date(start + cycle * 1800000 + entry.offset_seconds * 1000).toISOString(),
  })));
  return {
    schema_version: 'GrantM2DryRunSchedule@0.1.0',
    mode: 'DRY_RUN_ONLY',
    run_id: runId,
    start_at: startAt,
    end_at: endAt,
    // Separate proposal from the frozen pilot's 120-second cycle start bound.
    slot_lateness_tolerance_ms: 1000,
    quota_sha256: digest(encode(quota)),
    slots,
    rehearsal_started: false,
    milestone_2_started: false,
  };
}

function validateSchedule(schedule) {
  if (schedule?.schema_version !== 'GrantM2DryRunSchedule@0.1.0' || schedule.mode !== 'DRY_RUN_ONLY' ||
      schedule.rehearsal_started !== false || schedule.milestone_2_started !== false ||
      schedule.slot_lateness_tolerance_ms !== 1000 || schedule.slots?.length !== 12 ||
      new Set(schedule.slots.map(slot => slot.slot_id)).size !== 12) throw Error('Invalid dry-run schedule');
  const start = timestamp(schedule.start_at);
  if (timestamp(schedule.end_at) - start !== 3600000) throw Error('Invalid schedule duration');
  for (let i = 0; i < 12; i++) {
    if (timestamp(schedule.slots[i].due_at) !== start + Math.floor(i/6)*1800000 + (i%6)*20000) throw Error('Invalid slot offsets');
  }
}

export function decideTick(schedule, nowAt, previousRecords = []) {
  validateSchedule(schedule);
  const now = timestamp(nowAt);
  const previous = previousRecords.at(-1);
  if (previous && now < timestamp(previous.observed_at)) throw Error('Clock moved backwards');
  const done = new Set(previousRecords.flatMap(record => record.decisions.map(item => item.slot_id)));
  const decisions = schedule.slots.filter(slot => !done.has(slot.slot_id) && timestamp(slot.due_at) <= now).map(slot => ({
    slot_id: slot.slot_id,
    state: now - timestamp(slot.due_at) <= schedule.slot_lateness_tolerance_ms ? 'DRY_RUN_DUE' : 'MISSING',
  }));
  return {
    sequence: previousRecords.length,
    observed_at: nowAt,
    decisions,
    window_elapsed: now >= timestamp(schedule.end_at),
    qualifying_units: 0,
    rehearsal_started: false,
    milestone_2_started: false,
  };
}

async function exclusiveWrite(path, value) {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(encode(value) + '\n'); await file.sync(); }
  finally { await file.close(); }
}

// One immutable record per tick. A crash leaves the lock for manual inspection;
// it is never reclaimed automatically, and partial records are never repaired.
export async function advanceDryRun({ directory, schedule, nowAt }) {
  validateSchedule(schedule);
  timestamp(nowAt);
  await mkdir(directory, { recursive: true });
  const lockPath = join(directory, '.scheduler.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  let completed = false;
  try {
    const manifest = join(directory, 'schedule.json');
    try { await exclusiveWrite(manifest, schedule); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if ((await readFile(manifest, 'utf8')) !== encode(schedule) + '\n') throw Error('Schedule binding changed');
    const entries = await readdir(directory);
    if (entries.some(name => !['schedule.json', '.scheduler.lock'].includes(name) && !/^tick-\d{6}\.json$/.test(name))) throw Error('Unexpected journal entry');
    const files = entries.filter(name => name.startsWith('tick-')).sort();
    const records = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i] !== `tick-${String(i).padStart(6, '0')}.json`) throw Error('Journal sequence gap');
      const raw = await readFile(join(directory, files[i]), 'utf8');
      const record = JSON.parse(raw);
      const expected = decideTick(schedule, record.observed_at, records);
      if (raw !== encode(expected)+'\n') throw Error('Journal does not recompute');
      records.push(record);
    }
    const tick = decideTick(schedule, nowAt, records);
    if (tick.sequence >= 1000000) throw Error('Journal capacity exceeded');
    await exclusiveWrite(join(directory, `tick-${String(tick.sequence).padStart(6,'0')}.json`), tick);
    completed = true;
    return tick;
  } finally {
    await lock.close();
    if (completed) await unlink(lockPath);
  }
}
