import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { advanceDryRun, createRehearsalSchedule } from './lib/grant-m2-scheduler.mjs';

const [mode, runId, startAt, nowAt, output] = process.argv.slice(2);
if (mode !== '--dry-run' || !output || process.argv.length !== 7) throw Error('usage: --dry-run <run-id> <start-UTC> <tick-UTC> <directory-below-artifacts>');
const directory = resolve(output);
if (!directory.startsWith(resolve('artifacts') + sep)) throw Error('Dry-run output must be below artifacts');
const quota = JSON.parse(await readFile('deploy/grant-pilot/m2-resource-quota-estimate.json','utf8'));
const schedule = createRehearsalSchedule({ runId, startAt, quota });
console.log(JSON.stringify(await advanceDryRun({ directory, schedule, nowAt })));
