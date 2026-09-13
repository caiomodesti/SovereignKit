import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileGrantM2RehearsalSlot } from '../lib/grant-m2-rehearsal-reconciliation.mjs';

const observedAt = '2026-09-12T01:00:01.000Z';
const claims = ['reader-a', 'reader-b', 'reader-c'].map((reader, index) => ({ claim_id: `claim-${index}`, reader_id: reader, observed_at: observedAt, signature_status: 'finalized', transaction_slot: 123, observed_block_height: 100 }));
const entry = { schema_version: 'GrantM2PreparedDispatch@0.1.0', slot_id: 'a'.repeat(64), assignment: { schemaVersion: 'ObservationAssignment@0.1.0', assignmentId: 'assignment-a', payloadHash: 'b'.repeat(64), job: { schemaVersion: 'ObservationJob@0.1.0', resultId: 'result-a', observerId: 'observer-a', signature: 'signature-a', unit: { unit_id: 'unit-a', route_id: 'route-a' }, submission: { last_valid_block_height: 200 } } } };
const completion = { event: 'M2_OBSERVATION_JOB_COMPLETED', resultId: 'result-a', terminalState: 'FINALIZED', qualifyingUnits: 0 };
const raw = `${JSON.stringify({ schema_version: 'RawObservationPoll@0.2.0', assignment_id: 'assignment-a', assignment_payload_hash: 'b'.repeat(64), poll_index: 0, observed_at: observedAt, observer_id: 'observer-a', signature: 'signature-a', claims })}\n`;

test('recomputes a finalized rehearsal completion from raw three-reader quorum', () => {
  const result = reconcileGrantM2RehearsalSlot({ entry, completion, rawText: raw });
  assert.equal(result.terminal_state, 'FINALIZED');
  assert.equal(result.polls, 1);
  assert.equal(result.qualifying_units, 0);
});

test('rejects provenance drift, duplicate readers, partial JSONL and false terminal state', () => {
  assert.throws(() => reconcileGrantM2RehearsalSlot({ entry, completion, rawText: raw.replace('assignment-a', 'assignment-b') }), /provenance/u);
  const duplicate = raw.replace('reader-c', 'reader-b');
  assert.throws(() => reconcileGrantM2RehearsalSlot({ entry, completion, rawText: duplicate }), /three unique/u);
  assert.throws(() => reconcileGrantM2RehearsalSlot({ entry, completion, rawText: raw.trimEnd() }), /partial/u);
  assert.throws(() => reconcileGrantM2RehearsalSlot({ entry, completion: { ...completion, terminalState: 'CONFIRMED' }, rawText: raw }), /not finalized/u);
});
