import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { validateGrantM2LiveRun } from './lib/grant-m2-live-run.mjs';
import { reconcileGrantM2RehearsalSlot } from './lib/grant-m2-rehearsal-reconciliation.mjs';

const [runText, directoryText, expectedText, priorText] = process.argv.slice(2);
if ([runText, directoryText, expectedText, priorText].some(value => value === undefined)) {
  throw Error('usage: verify-grant-m2-rehearsal-execution <run> <directory> <expected-new> <prior>');
}
const expectedNew = Number(expectedText); const prior = Number(priorText);
if (!Number.isSafeInteger(expectedNew) || expectedNew < 1 || !Number.isSafeInteger(prior) || prior < 0 || expectedNew + prior > 12) {
  throw Error('rehearsal transaction bounds are invalid');
}
const run = JSON.parse(await readFile(resolve(runText), 'utf8'));
validateGrantM2LiveRun(run);
const root = resolve(directoryText);
const entries = await readdir(root, { withFileTypes: true });
const slotDirectories = entries.filter(entry => entry.isDirectory() && /^[a-f0-9]{64}$/u.test(entry.name)).map(entry => entry.name).sort();
const expectedSlots = run.schedule.slots.slice(0, expectedNew).map(slot => slot.slot_id).sort();
if (JSON.stringify(slotDirectories) !== JSON.stringify(expectedSlots)) throw Error('rehearsal slot directory set does not match the authorized schedule');

const reconciled = [];
for (const slotId of slotDirectories) {
  const directory = join(root, slotId);
  reconciled.push(reconcileGrantM2RehearsalSlot({
    entry: JSON.parse(await readFile(join(directory, 'prepared-dispatch.json'), 'utf8')),
    completion: JSON.parse(await readFile(join(directory, 'completion.json'), 'utf8')),
    rawText: await readFile(join(directory, 'raw.jsonl'), 'utf8'),
  }));
}
if (new Set(reconciled.map(item => item.signature)).size !== expectedNew || new Set(reconciled.map(item => item.unit_id)).size !== expectedNew ||
    reconciled.some(item => item.terminal_state !== 'FINALIZED' || item.qualifying_units !== 0)) throw Error('reconciled rehearsal identities or terminal states are invalid');

const orchestratorText = await readFile(join(root, 'orchestrator.jsonl'), 'utf8');
if (!orchestratorText.endsWith('\n')) throw Error('orchestrator journal has a partial record');
const events = orchestratorText.trimEnd().split('\n').map(line => JSON.parse(line));
const finalEvents = events.filter(event => event.event === 'REHEARSAL_SLOTS_COMPLETED');
if (events.some(event => event.event === 'REHEARSAL_STOPPED_FAIL_CLOSED') || finalEvents.length !== 1 ||
    finalEvents[0].completed_new_slots !== expectedNew || finalEvents[0].prior_rehearsal_transactions !== prior ||
    finalEvents[0].total_rehearsal_transactions !== expectedNew + prior || finalEvents[0].elapsed_seconds !== 3600 ||
    finalEvents[0].qualifying_units !== 0 || finalEvents[0].official_window_started !== false) throw Error('orchestrator completion evidence is invalid');

const byObserver = Object.fromEntries([...new Set(reconciled.map(item => item.observer_id))].sort().map(id => [id, reconciled.filter(item => item.observer_id === id).length]));
const byRoute = Object.fromEntries([...new Set(reconciled.map(item => item.route_id))].sort().map(id => [id, reconciled.filter(item => item.route_id === id).length]));
process.stdout.write(`${JSON.stringify({ status: 'PASS', gate: 'GRANT_M2_REHEARSAL_RAW_TO_DERIVED', runId: run.run_id, newTransactions: expectedNew, priorTransactions: prior, totalTransactions: expectedNew + prior, finalized: reconciled.length, totalRawPolls: reconciled.reduce((sum, item) => sum + item.polls, 0), byObserver, byRoute, uniqueSignatures: expectedNew, qualifyingUnits: 0, officialWindowStarted: false, orchestratorBytes: Buffer.byteLength(orchestratorText), orchestratorSha256: createHash('sha256').update(orchestratorText).digest('hex') })}\n`);
