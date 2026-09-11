import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openExclusiveObserverSequenceJournal } from '../lib/grant-m2-observer-sequence-journal.mjs';

const hash = digit => digit.repeat(64);
async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'grant-m2-sequence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('reserves monotonic sequences durably and never reallocates a slot', async t => {
  const directory = await temporaryDirectory(t);
  const first = await openExclusiveObserverSequenceJournal({ directory, observerId: 'observer-aws-a' });
  const initial = await first.reserve({ slotId: hash('a'), unitId: hash('b'), assignmentId: randomUUID(), reservedAt: '2026-09-11T00:00:00.000Z' });
  assert.equal(initial.record.observer_sequence, 0);
  assert.equal((await first.reserve({ slotId: hash('a'), unitId: hash('b'), assignmentId: randomUUID(), reservedAt: '2026-09-11T00:00:01.000Z' })).status, 'RECONCILIATION_REQUIRED');
  await first.close();
  const second = await openExclusiveObserverSequenceJournal({ directory, observerId: 'observer-aws-a' });
  const next = await second.reserve({ slotId: hash('c'), unitId: hash('d'), assignmentId: randomUUID(), reservedAt: '2026-09-11T00:00:02.000Z' });
  assert.equal(next.record.observer_sequence, 1);
  await second.close();
  assert.equal((await readFile(join(directory, 'observer-aws-a.jsonl'), 'utf8')).trimEnd().split('\n').length, 2);
});

test('serializes access and fails closed on partial history', async t => {
  const directory = await temporaryDirectory(t);
  const first = await openExclusiveObserverSequenceJournal({ directory, observerId: 'observer-google-e2-micro' });
  await assert.rejects(openExclusiveObserverSequenceJournal({ directory, observerId: 'observer-google-e2-micro' }), /already locked/u);
  await first.close();
  await writeFile(join(directory, 'observer-oracle-a1.jsonl'), '{"partial":true}', 'utf8');
  await assert.rejects(openExclusiveObserverSequenceJournal({ directory, observerId: 'observer-oracle-a1' }), /partial trailing/u);
  await assert.rejects(openExclusiveObserverSequenceJournal({ directory, observerId: 'observer-oracle-a1' }), /already locked/u);
});

