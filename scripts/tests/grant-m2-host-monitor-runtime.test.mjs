import assert from 'node:assert/strict';
import test from 'node:test';

import { computeBacklog, parseClockOffsetMs, parseMemAvailableBytes, quotaRemainingPercent } from '../lib/grant-m2-host-monitor-runtime.mjs';

test('parses Linux memory and systemd clock offset without sign confusion', () => {
  assert.equal(parseMemAvailableBytes('MemTotal: 1000 kB\nMemAvailable:     577804 kB\n'), 577804 * 1024);
  assert.equal(parseClockOffsetMs('-750us\n'), 0.75);
  assert.equal(parseClockOffsetMs('+1.25ms\n'), 1.25);
  assert.equal(parseClockOffsetMs('Server: metadata\n       Offset: +35us\n        Delay: 831us\n'), 0.035);
});

test('recomputes quota from complete durable journal tails', () => {
  const line = `${JSON.stringify({ schema_version: 'GrantM2RpcBudgetJournal@0.1.0', sequence: 2, total_limit: 10000, state: { spent: 800 } })}\n`;
  assert.equal(quotaRemainingPercent([line]), 92);
  assert.throws(() => quotaRemainingPercent([line.trimEnd()]), /partial/u);
});

test('counts only assignments without completion and retains oldest age', () => {
  assert.deepEqual(computeBacklog([{ id: 'a', mtimeMs: 1000 }, { id: 'b', mtimeMs: 4000 }], ['b'], 11000), { count: 1, oldestAgeSeconds: 10 });
});
