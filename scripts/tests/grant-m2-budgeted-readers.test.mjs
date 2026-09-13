import assert from 'node:assert/strict';
import test from 'node:test';

import { createGrantM2BudgetedReaders } from '../lib/grant-m2-budgeted-readers.mjs';

const registry = {
  schemaVersion: 'ObservationReaderRegistry@0.1.0',
  readers: [
    { readerId: 'grant-m2-reader-public-a', endpoint: 'https://api.devnet.solana.com' },
    { readerId: 'grant-m2-reader-alchemy', endpoint: 'https://solana-devnet.g.alchemy.com/v2/test' },
    { readerId: 'grant-m2-reader-public-b', endpoint: 'https://api.devnet.solana.com' },
  ],
};

test('routes only Alchemy reader calls through one shared budget', async () => {
  const budgetedMethods = [], directCalls = [];
  const budget = { callWhenAvailable: async (method, operation, options) => {
    budgetedMethods.push([method, options.abortSignal]);
    return { allowed: true, value: await operation() };
  } };
  const readers = createGrantM2BudgetedReaders({ registry, budget, readerFactory: readerId => ({
    readerId,
    getSignatureStatus: async () => { directCalls.push(`${readerId}:status`); return { status: 'finalized' }; },
    getBlockHeight: async () => { directCalls.push(`${readerId}:height`); return 10n; },
  }) });
  const controller = new AbortController();
  await Promise.all(readers.flatMap(reader => [reader.getSignatureStatus('x', controller.signal), reader.getBlockHeight(controller.signal)]));
  assert.deepEqual(budgetedMethods.map(([method]) => method), ['getSignatureStatuses', 'getBlockHeight']);
  assert.ok(budgetedMethods.every(([, signal]) => signal === controller.signal));
  assert.equal(directCalls.length, 6);
});

test('rejects registry order drift and quota denial', async () => {
  const drifted = structuredClone(registry); drifted.readers.reverse();
  assert.throws(() => createGrantM2BudgetedReaders({ registry: drifted, budget: { callWhenAvailable() {} }, readerFactory() {} }), /drift/u);
  const readers = createGrantM2BudgetedReaders({ registry, budget: { callWhenAvailable: async () => ({ allowed: false, reason: 'TOTAL_QUOTA' }) }, readerFactory: readerId => ({ readerId, getSignatureStatus: async () => ({}), getBlockHeight: async () => 1n }) });
  await assert.rejects(readers[1].getSignatureStatus('x'), /TOTAL_QUOTA/u);
});

