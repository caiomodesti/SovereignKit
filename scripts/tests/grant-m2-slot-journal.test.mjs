import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { reserveM2RehearsalSlot } from '../lib/grant-m2-slot-journal.mjs';

const hash = digit => digit.repeat(64);
async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'grant-m2-slot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('persists the slot before side effects and enforces ordered evidence', async t => {
  const directory = await temporaryDirectory(t);
  const slot = await reserveM2RehearsalSlot({ directory, scheduleHash: hash('a'), slotId: hash('b'), unitId: hash('c'), observerId: 'observer-aws-a', reservedAt: '2026-09-11T12:00:00.000Z' });
  assert.equal(slot.status, 'RESERVED');
  await assert.rejects(slot.record('SUBMISSION_ACKNOWLEDGED', {}, '2026-09-11T12:00:00.001Z'), /transition/u);
  await slot.record('TRANSACTION_PREPARED', { signature: 'retained' }, '2026-09-11T12:00:00.001Z');
  await slot.record('SUBMISSION_ACKNOWLEDGED', { signature: 'retained' }, '2026-09-11T12:00:00.002Z');
  assert.deepEqual((await readdir(join(directory, hash('b')))).sort(), [
    '00-reservation.json', '01-transaction-prepared.json', '02-submission-acknowledged.json',
  ]);
  assert.equal((await reserveM2RehearsalSlot({ directory, scheduleHash: hash('a'), slotId: hash('b'), unitId: hash('c'), observerId: 'observer-aws-a', reservedAt: '2026-09-11T12:00:01.000Z' })).status, 'RECONCILIATION_REQUIRED');
});

test('an uncertain side effect permanently closes automatic progress', async t => {
  const directory = await temporaryDirectory(t);
  const slot = await reserveM2RehearsalSlot({ directory, scheduleHash: hash('d'), slotId: hash('e'), unitId: hash('f'), observerId: 'observer-oracle-a1', reservedAt: '2026-09-11T12:00:00.000Z' });
  await slot.markUncertain('TRANSACTION_PREPARED', { reason: 'write result unknown' }, '2026-09-11T12:00:00.001Z');
  await assert.rejects(slot.record('TRANSACTION_PREPARED', {}, '2026-09-11T12:00:00.002Z'), /reconciliation/u);
});

