import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { generateAssignmentAuthorityKeyPair, signObservationAssignment } from '../../packages/collector/dist/observation-assignment.js';

const run = promisify(execFile);
const sha = value => createHash('sha256').update(value).digest('hex');

test('runs the M2 worker against local RPC and journals only Alchemy calls', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'grant-m2-worker-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const methods = [];
  const server = createServer(async (request, response) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    const body = JSON.parse(text);
    methods.push(body.method);
    const result = body.method === 'getSignatureStatuses'
      ? { context: { slot: 20 }, value: [{ slot: 19, confirmations: null, err: null, confirmationStatus: 'finalized' }] }
      : 30;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}`;

  const now = new Date();
  const issuedAt = new Date(now.getTime() - 1_000).toISOString();
  const expiresAt = new Date(now.getTime() + 180_000).toISOString();
  const observerId = 'observer-aws-a';
  const unit = {
    experiment_id: 'm2-rehearsal-local-process-test', experiment_version: '1', phase: 'healthy',
    observer_id: observerId, route_id: 'alchemy-solana-devnet', transaction_class: 'MATCHED_CONTROL', probe_index: 0,
  };
  unit.unit_id = sha(Object.values(unit).join('\u001f'));
  const signer = generateAssignmentAuthorityKeyPair('local-test-issuer', 'local-test-key');
  const job = {
    schemaVersion: 'ObservationJob@0.1.0', resultId: randomUUID(), observerId, observerKeyId: 'observer-test-key', observerSequence: 0,
    unit, experimentDefinitionHash: 'a'.repeat(64), signature: '2'.repeat(88),
    submission: { attempt_id: sha(`${unit.unit_id}:attempt-1`), attempt_number: 1, outcome: 'RPC_ACKNOWLEDGED', blockhash: '1'.repeat(32), blockhash_context_slot: 1, last_valid_block_height: 100, serialized_size_bytes: 215, created_at: issuedAt, submitted_at: issuedAt, response_at: issuedAt },
    pollIntervalMs: 5000, observationDeadlineMs: 120000, readerRequestTimeoutMs: 10000,
  };
  const assignment = signObservationAssignment({ schemaVersion: 'ObservationAssignment@0.1.0', assignmentId: randomUUID(), issuerId: signer.issuerId, issuerKeyId: signer.keyId, issuedAt, expiresAt, job }, signer);
  const paths = {
    assignment: join(directory, 'assignment.json'), authorities: join(directory, 'authorities.json'), readers: join(directory, 'readers.json'),
    output: join(directory, 'result.json'), raw: join(directory, 'raw.jsonl'), quota: join(directory, 'quota'),
  };
  await Promise.all([
    writeFile(paths.assignment, JSON.stringify(assignment)),
    writeFile(paths.authorities, JSON.stringify([{ issuerId: signer.issuerId, keyId: signer.keyId, publicKeySpkiBase64: signer.publicKeySpkiBase64, validFrom: issuedAt }])),
    writeFile(paths.readers, JSON.stringify({ schemaVersion: 'ObservationReaderRegistry@0.1.0', readers: ['public-a', 'alchemy', 'public-b'].map(label => ({ readerId: `grant-m2-reader-${label}`, endpoint })) })),
  ]);
  const { stdout } = await run(process.execPath, ['scripts/run-grant-m2-observation-worker.mjs', paths.assignment, paths.authorities, paths.readers, paths.output, paths.raw, paths.quota, observerId, '100'], { cwd: process.cwd(), windowsHide: true });
  assert.equal(JSON.parse(stdout).event, 'M2_OBSERVATION_JOB_COMPLETED');
  assert.equal(JSON.parse(await readFile(paths.output, 'utf8')).terminal_state, 'FINALIZED');
  assert.equal(methods.filter(method => method === 'getSignatureStatuses').length, 3);
  assert.equal(methods.filter(method => method === 'getBlockHeight').length, 3);
  const quotaRecords = (await readFile(join(paths.quota, `${observerId}.jsonl`), 'utf8')).trimEnd().split('\n').map(JSON.parse);
  assert.equal(quotaRecords.length, 4);
  assert.equal(quotaRecords.at(-1).state.spent, 40);
});

