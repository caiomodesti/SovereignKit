import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { completeM2RehearsalSlot } from './lib/grant-m2-slot-journal.mjs';

const args = parseArgs(process.argv.slice(2));
const [entry, receipt, receiptAuthority, workerEvidence] = await Promise.all([
  readJson(required('entry')), readJson(required('receipt')), readJson(required('receipt-authority')), readJson(required('worker-evidence')),
]);
const result = await completeM2RehearsalSlot({
  directory: resolve(required('slot-journal-directory')), slotId: required('slot-id'), entry, receipt, receiptAuthority,
  transportRecordedAt: required('transport-recorded-at'), workerEvidence, workerRecordedAt: required('worker-recorded-at'),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status !== 'WORKER_COMPLETED') process.exitCode = 2;

async function readJson(path) { return JSON.parse(await readFile(resolve(path), 'utf8')); }
function parseArgs(values) {
  if (values.length % 2 !== 0) throw Error('Invalid arguments');
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--') || result.has(key.slice(2))) throw Error('Invalid arguments');
    result.set(key.slice(2), value);
  }
  return result;
}
function required(name) { const value = args.get(name); if (typeof value !== 'string' || value.length === 0) throw Error(`--${name} is required`); return value; }
