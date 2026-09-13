import { mkdir, open, readFile, rmdir } from 'node:fs/promises';
import { join } from 'node:path';

const VERSION = 'GrantM2RpcBudgetJournal@0.1.0';

function validateName(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(value)) throw Error('Invalid budget journal owner');
}

function parseJournal(text, owner, totalLimit) {
  if (text === '') return { restored: undefined, sequence: 0 };
  if (!text.endsWith('\n')) throw Error('Budget journal has a partial trailing record');
  let restored;
  let sequence = 0;
  for (const line of text.trimEnd().split('\n')) {
    let record;
    try { record = JSON.parse(line); } catch { throw Error('Budget journal contains invalid JSON'); }
    sequence += 1;
    if (record?.schema_version !== VERSION || record.sequence !== sequence || record.owner !== owner ||
        record.total_limit !== totalLimit || typeof record.state !== 'object' || record.state === null) {
      throw Error('Budget journal record is invalid');
    }
    restored = record.state;
  }
  return { restored, sequence };
}

export async function openExclusiveRpcBudgetJournal({ directory, owner, totalLimit }) {
  if (typeof directory !== 'string' || directory.length === 0 || !Number.isSafeInteger(totalLimit) || totalLimit < 20) {
    throw Error('Invalid budget journal configuration');
  }
  validateName(owner);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, `${owner}.lock`);
  try { await mkdir(lockPath, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === 'EEXIST') throw Error('Budget journal is already locked or requires reconciliation');
    throw error;
  }

  const journalPath = join(directory, `${owner}.jsonl`);
  let handle;
  try {
    handle = await open(journalPath, 'a+', 0o600);
    const { restored, sequence: initialSequence } = parseJournal(await readFile(journalPath, 'utf8'), owner, totalLimit);
    let sequence = initialSequence;
    let closed = false;
    return {
      restored,
      async persist(state) {
        if (closed) throw Error('Budget journal is closed');
        sequence += 1;
        const record = { schema_version: VERSION, sequence, owner, total_limit: totalLimit, state };
        await handle.appendFile(`${JSON.stringify(record)}\n`, 'utf8');
        await handle.sync();
      },
      async close() {
        if (closed) return;
        closed = true;
        await handle.close();
        await rmdir(lockPath);
      },
      async abandon() {
        if (closed) return;
        closed = true;
        await handle.close();
        // Keep the lock as a visible reconciliation requirement.
      },
    };
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => {});
    // A malformed or partial journal keeps its lock as an explicit
    // reconciliation signal. Failures before open are safe to unlock.
    if (handle === undefined) await rmdir(lockPath).catch(() => {});
    throw error;
  }
}
