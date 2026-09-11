import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { executeObservationAssignment } from '../packages/collector/dist/observation-worker.js';
import { createRpcBudget } from './lib/grant-m2-rpc-budget.mjs';
import { openExclusiveRpcBudgetJournal } from './lib/grant-m2-rpc-budget-journal.mjs';
import { createGrantM2BudgetedReaders } from './lib/grant-m2-budgeted-readers.mjs';

const args = process.argv.slice(2);
if (args.length !== 8) {
  throw Error('usage: run-grant-m2-observation-worker <assignment> <authorities> <readers> <unsigned-output> <raw-log> <quota-directory> <owner> <total-limit>');
}
const [assignmentText, authoritiesText, readersText, unsignedText, rawText, quotaDirectoryText, owner, totalLimitText] = args;
const [assignment, authorities, registry] = await Promise.all([
  readJson(resolve(assignmentText)), readJson(resolve(authoritiesText)), readJson(resolve(readersText)),
]);
if (!Array.isArray(authorities)) throw Error('invalid assignment authority allowlist');
const authority = authorities.find(entry => entry.issuerId === assignment.issuerId && entry.keyId === assignment.issuerKeyId);
if (authority === undefined) throw Error('assignment authority is not allowlisted');
if (assignment?.job?.observerId !== owner) throw Error('quota owner does not match assignment observer');
const totalLimit = Number(totalLimitText);
const journal = await openExclusiveRpcBudgetJournal({ directory: resolve(quotaDirectoryText), owner, totalLimit });
const budget = createRpcBudget({ owner, totalLimit, restored: journal.restored, persist: journal.persist, now: Date.now });
try {
  const readers = createGrantM2BudgetedReaders({ registry, budget });
  const unsignedOutput = resolve(unsignedText);
  const rawLogPath = resolve(rawText);
  await mkdir(dirname(unsignedOutput), { recursive: true });
  await mkdir(dirname(rawLogPath), { recursive: true });
  const unsigned = await executeObservationAssignment({ assignment, authority, readers, rawLogPath });
  if (budget.requiresReconciliation()) throw Error('RPC budget requires reconciliation');
  const output = await open(unsignedOutput, 'wx', 0o600);
  try { await output.writeFile(`${JSON.stringify(unsigned)}\n`, 'utf8'); await output.sync(); }
  finally { await output.close(); }
  await journal.close();
  process.stdout.write(`${JSON.stringify({ event: 'M2_OBSERVATION_JOB_COMPLETED', resultId: unsigned.result_id, terminalState: unsigned.terminal_state, qualifyingUnits: 0 })}\n`);
} catch (error) {
  if (budget.requiresReconciliation()) await journal.abandon();
  else await journal.close();
  throw error;
}

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

