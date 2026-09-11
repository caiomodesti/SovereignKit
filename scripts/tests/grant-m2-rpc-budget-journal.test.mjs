import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createRpcBudget } from '../lib/grant-m2-rpc-budget.mjs';
import { openExclusiveRpcBudgetJournal } from '../lib/grant-m2-rpc-budget-journal.mjs';

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'grant-m2-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('durably restores charged quota through an append-only journal', async t => {
  const directory = await temporaryDirectory(t);
  const first = await openExclusiveRpcBudgetJournal({ directory, owner: 'observer-aws-a', totalLimit: 100 });
  const budget = createRpcBudget({ owner: 'observer-aws-a', totalLimit: 100, restored: first.restored, persist: first.persist, now: () => 1_000 });
  assert.deepEqual(await budget.call('getHealth', async () => 'ok'), { allowed: true, value: 'ok' });
  await first.close();

  const second = await openExclusiveRpcBudgetJournal({ directory, owner: 'observer-aws-a', totalLimit: 100 });
  assert.equal(second.restored.spent, 20);
  assert.equal(second.restored.recent[0].pending, false);
  await second.close();
  const records = (await readFile(join(directory, 'observer-aws-a.jsonl'), 'utf8')).trimEnd().split('\n');
  assert.equal(records.length, 2);
});

test('holds one exclusive owner lock until a clean close', async t => {
  const directory = await temporaryDirectory(t);
  const first = await openExclusiveRpcBudgetJournal({ directory, owner: 'coordinator', totalLimit: 100 });
  await assert.rejects(openExclusiveRpcBudgetJournal({ directory, owner: 'coordinator', totalLimit: 100 }), /already locked/u);
  await first.close();
  const reopened = await openExclusiveRpcBudgetJournal({ directory, owner: 'coordinator', totalLimit: 100 });
  await reopened.close();
});

test('fails closed on a partial journal and retains the reconciliation lock', async t => {
  const directory = await temporaryDirectory(t);
  await writeFile(join(directory, 'observer-oracle-a1.jsonl'), '{"partial":true}', 'utf8');
  await assert.rejects(openExclusiveRpcBudgetJournal({ directory, owner: 'observer-oracle-a1', totalLimit: 100 }), /partial trailing record/u);
  await assert.rejects(openExclusiveRpcBudgetJournal({ directory, owner: 'observer-oracle-a1', totalLimit: 100 }), /already locked/u);
});

