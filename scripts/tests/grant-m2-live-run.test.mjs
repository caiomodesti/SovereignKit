import assert from 'node:assert/strict';
import test from 'node:test';

import quota from '../../deploy/grant-pilot/m2-resource-quota-estimate.json' with { type: 'json' };
import { AUTHORIZATION_TEXT, createGrantM2LiveRun, validateGrantM2LiveRun } from '../lib/grant-m2-live-run.mjs';

const input = {
  runId: 'm2-rehearsal-20260911', authorizedAt: '2026-09-11T12:00:00.000Z', startAt: '2026-09-11T12:05:00.000Z',
  authorizationText: AUTHORIZATION_TEXT, quota, sourceCommit: 'a'.repeat(40),
  observerSequences: { 'observer-aws-a': 41, 'observer-google-e2-micro': 9, 'observer-oracle-a1': 17 },
};

test('creates an exact-scope live rehearsal record without starting M2', () => {
  const run = createGrantM2LiveRun(input);
  assert.deepEqual(validateGrantM2LiveRun(run), { status: 'PASS', gate: 'GRANT_M2_LIVE_REHEARSAL_RUN', expectedTransactions: 12, officialWindowStarted: false });
  assert.equal(run.schedule.slots.length, 12);
  assert.equal(run.authorization.not_after, run.schedule.end_at);
});

test('rejects paraphrased authorization, short lead time, and missing sequence provenance', () => {
  assert.throws(() => createGrantM2LiveRun({ ...input, authorizationText: 'continue' }), /authorization/u);
  assert.throws(() => createGrantM2LiveRun({ ...input, startAt: '2026-09-11T12:01:59.999Z' }), /lead time/u);
  assert.throws(() => createGrantM2LiveRun({ ...input, observerSequences: { 'observer-aws-a': 1 } }), /sequence bases/u);
});

test('rejects any attempt to relabel the rehearsal as an official window', () => {
  const run = createGrantM2LiveRun(input);
  run.official_window_started = true;
  assert.throws(() => validateGrantM2LiveRun(run), /contract/u);
});
