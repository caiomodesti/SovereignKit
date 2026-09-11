import { mkdir, open, readFile, rmdir } from 'node:fs/promises';
import { join } from 'node:path';

const VERSION = 'GrantM2ObserverSequenceJournal@0.1.0';
const OBSERVERS = ['observer-aws-a', 'observer-google-e2-micro', 'observer-oracle-a1'];
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value);

function parseJournal(text, observerId, initialSequence) {
  if (text === '') return [];
  if (!text.endsWith('\n')) throw Error('Observer sequence journal has a partial trailing record');
  const records = [];
  const slots = new Set();
  const assignments = new Set();
  for (const [index, line] of text.trimEnd().split('\n').entries()) {
    let record;
    try { record = JSON.parse(line); } catch { throw Error('Observer sequence journal contains invalid JSON'); }
    if (record?.schema_version !== VERSION || record.observer_id !== observerId || record.observer_sequence !== initialSequence + index ||
        !isHash(record.slot_id) || !isHash(record.unit_id) || !isUuid(record.assignment_id) ||
        slots.has(record.slot_id) || assignments.has(record.assignment_id)) {
      throw Error('Observer sequence journal record is invalid');
    }
    slots.add(record.slot_id); assignments.add(record.assignment_id); records.push(record);
  }
  return records;
}

export async function openExclusiveObserverSequenceJournal({ directory, observerId, initialSequence = 0 }) {
  if (typeof directory !== 'string' || directory.length === 0 || !OBSERVERS.includes(observerId) ||
      !Number.isSafeInteger(initialSequence) || initialSequence < 0) throw Error('Invalid observer sequence journal configuration');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, `${observerId}.lock`);
  try { await mkdir(lockPath, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === 'EEXIST') throw Error('Observer sequence journal is already locked or requires reconciliation');
    throw error;
  }
  const journalPath = join(directory, `${observerId}.jsonl`);
  let handle;
  try {
    handle = await open(journalPath, 'a+', 0o600);
    const records = parseJournal(await readFile(journalPath, 'utf8'), observerId, initialSequence);
    let closed = false;
    return {
      async reserve({ slotId, unitId, assignmentId, reservedAt }) {
        if (closed) throw Error('Observer sequence journal is closed');
        if (!isHash(slotId) || !isHash(unitId) || !isUuid(assignmentId) ||
            typeof reservedAt !== 'string' || new Date(reservedAt).toISOString() !== reservedAt) {
          throw Error('Invalid observer sequence reservation');
        }
        const prior = records.find(record => record.slot_id === slotId);
        if (prior !== undefined) return { status: 'RECONCILIATION_REQUIRED', record: structuredClone(prior) };
        const record = { schema_version: VERSION, observer_id: observerId, observer_sequence: initialSequence + records.length, slot_id: slotId, unit_id: unitId, assignment_id: assignmentId, reserved_at: reservedAt };
        await handle.appendFile(`${JSON.stringify(record)}\n`, 'utf8');
        await handle.sync();
        records.push(record);
        return { status: 'RESERVED', record: structuredClone(record) };
      },
      async close() {
        if (closed) return;
        closed = true; await handle.close(); await rmdir(lockPath);
      },
      async abandon() {
        if (closed) return;
        closed = true; await handle.close();
      },
    };
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => {});
    if (handle === undefined) await rmdir(lockPath).catch(() => {});
    throw error;
  }
}
