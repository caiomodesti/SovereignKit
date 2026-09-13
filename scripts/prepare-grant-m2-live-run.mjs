import { execFileSync } from 'node:child_process';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import quota from '../deploy/grant-pilot/m2-resource-quota-estimate.json' with { type: 'json' };
import { createGrantM2LiveRun, validateGrantM2LiveRun } from './lib/grant-m2-live-run.mjs';

const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(required('output'));
const authorizationText = (await readFile(resolve(required('authorization-text-file')), 'utf8')).trim();
const sequences = JSON.parse(await readFile(resolve(required('observer-sequences')), 'utf8'));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const run = createGrantM2LiveRun({
  runId: required('run-id'), startAt: required('start-at'), authorizedAt: required('authorized-at'),
  authorizationText, quota, observerSequences: sequences, sourceCommit,
});
validateGrantM2LiveRun(run);
await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
const handle = await open(outputPath, 'wx', 0o600);
try { await handle.writeFile(`${JSON.stringify(run, null, 2)}\n`, 'utf8'); await handle.sync(); }
finally { await handle.close(); }
process.stdout.write(`${JSON.stringify({ status: 'AUTHORIZED_NOT_STARTED', runId: run.run_id, startAt: run.schedule.start_at, endAt: run.schedule.end_at, scheduleSha256: run.authorization.schedule_sha256, maximumTransactions: 12, milestone2Started: false, officialWindowStarted: false, output: outputPath })}\n`);

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
