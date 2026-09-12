import { readFile } from 'node:fs/promises';

import { validateGrantM2LiveMonitorPolicy } from './lib/grant-m2-live-monitor.mjs';

const path = process.argv[2] ?? 'deploy/grant-pilot/m2-live-monitor-policy.json';
const policy = JSON.parse(await readFile(path, 'utf8'));
const baseline = await readFile(policy.baseline_alert_policy.path, 'utf8');
process.stdout.write(`${JSON.stringify(validateGrantM2LiveMonitorPolicy(policy, baseline))}\n`);
