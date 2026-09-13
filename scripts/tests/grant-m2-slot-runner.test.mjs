import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { generateAssignmentAuthorityKeyPair } from '../../packages/collector/dist/observation-assignment.js';
import { sha256Hex } from '../../packages/probes/dist/canonical.js';
import { createRehearsalSchedule } from '../lib/grant-m2-scheduler.mjs';
import { openExclusiveObserverSequenceJournal } from '../lib/grant-m2-observer-sequence-journal.mjs';
import { prepareAndSubmitM2RehearsalSlot } from '../lib/grant-m2-slot-runner.mjs';
import quota from '../../deploy/grant-pilot/m2-resource-quota-estimate.json' with { type: 'json' };
import { scheduleHash } from '../lib/grant-m2-dispatch.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'grant-m2-runner-'));
  const schedule = createRehearsalSchedule({ runId: 'runner-test', startAt: '2026-09-11T12:00:00.000Z', quota });
  const slot = schedule.slots[0];
  const sequenceJournal = await openExclusiveObserverSequenceJournal({ directory: join(root, 'sequences'), observerId: slot.observer_id });
  t.after(async () => { await sequenceJournal.close(); await rm(root, { recursive: true, force: true }); });
  return { root, schedule, slot, sequenceJournal, signer: generateAssignmentAuthorityKeyPair('coordinator', 'assignment-key') };
}

test('reserves, submits once and emits a slot-bound signed assignment', async t => {
  const f = await fixture(t);
  let submissions = 0;
  const times = Array.from({ length: 5 }, (_, index) => new Date(Date.parse(f.slot.due_at) + 100 + index).toISOString());
  const result = await prepareAndSubmitM2RehearsalSlot({
    schedule: f.schedule, slotId: f.slot.slot_id,
    authorization: { authorized: true, scope: 'PRE_M2_REHEARSAL_ONLY', schedule_sha256: scheduleHash(f.schedule), not_before: f.schedule.start_at, not_after: f.schedule.end_at },
    observerKeyId: 'observer-key', signer: f.signer, sequenceJournal: f.sequenceJournal, slotJournalDirectory: join(f.root, 'slots'), nowAt: f.slot.due_at,
    prepareTransaction: async unit => ({ endpoint: 'https://secret.invalid/key', unitId: unit.unitId, signature: '1'.repeat(88), wireTransactionBase64: 'AQID', blockhash: '1'.repeat(32), blockhashContextSlot: 1, lastValidBlockHeight: 2, serializedSizeBytes: 3, createdAt: f.slot.due_at }),
    submitTransaction: async prepared => { submissions += 1; return { signature: prepared.signature, wireTransactionBase64: prepared.wireTransactionBase64, submission: { attempt_id: sha256Hex(`${prepared.unitId}:attempt-1`), attempt_number: 1, outcome: 'RPC_ACKNOWLEDGED', blockhash: prepared.blockhash, blockhash_context_slot: 1, last_valid_block_height: 2, serialized_size_bytes: 3, created_at: f.slot.due_at, submitted_at: f.slot.due_at, response_at: f.slot.due_at } }; },
    now: () => new Date(times.shift() ?? f.slot.due_at),
  });
  assert.equal(result.status, 'ASSIGNMENT_PREPARED');
  assert.equal(result.entry.assignment.job.observerSequence, 0);
  assert.equal(result.entry.assignment.job.submission.attempt_id, sha256Hex(`${result.entry.assignment.job.unit.unit_id}:attempt-1`));
  assert.equal(submissions, 1);
});

test('never retries or prepares an assignment after ambiguous submission', async t => {
  const f = await fixture(t);
  let submissions = 0;
  const result = await prepareAndSubmitM2RehearsalSlot({
    schedule: f.schedule, slotId: f.slot.slot_id,
    authorization: { authorized: true, scope: 'PRE_M2_REHEARSAL_ONLY', schedule_sha256: scheduleHash(f.schedule), not_before: f.schedule.start_at, not_after: f.schedule.end_at },
    observerKeyId: 'observer-key', signer: f.signer, sequenceJournal: f.sequenceJournal, slotJournalDirectory: join(f.root, 'slots'), nowAt: f.slot.due_at,
    prepareTransaction: async unit => ({ unitId: unit.unitId, signature: '1'.repeat(88), wireTransactionBase64: 'AQID' }),
    submitTransaction: async () => { submissions += 1; throw Error('secret endpoint timeout'); },
    now: () => new Date(f.slot.due_at),
  });
  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.equal(submissions, 1);
});
