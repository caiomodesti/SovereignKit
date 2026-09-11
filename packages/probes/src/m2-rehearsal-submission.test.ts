import { createServer } from 'node:http';

import { generateKeyPairSigner } from '@solana/kit';
import { describe, expect, test } from 'vitest';

import { deriveUnitId } from './units.js';
import { submitM2RehearsalProbe } from './m2-rehearsal-submission.js';

describe('M2 rehearsal submission', () => {
  test('submits one unique probe with no RPC retry and exact provenance', async () => {
    const requests: Array<{ method: string; params: unknown[] }> = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { id: string; method: string; params: unknown[] };
      requests.push({ method: body.method, params: body.params });
      const result = body.method === 'getLatestBlockhash'
        ? { context: { slot: 123 }, value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 456 } }
        : signatureFromWire(String(body.params[0]));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('test server did not bind');
      const identity = {
        experimentId: 'm2-rehearsal-test', experimentVersion: '1', phase: 'healthy' as const,
        observerId: 'observer-aws-a', routeId: 'solana-public-devnet', transactionClass: 'MATCHED_CONTROL' as const, probeIndex: 0,
      };
      const unit = { ...identity, unitId: deriveUnitId(identity) };
      const calls: string[] = [];
      const expectedTimes = ['2026-09-11T12:00:00.000Z', '2026-09-11T12:00:00.010Z', '2026-09-11T12:00:00.020Z'];
      const times = [...expectedTimes];
      const result = await submitM2RehearsalProbe({
        endpoint: `http://127.0.0.1:${address.port}`,
        unit,
        feePayer: await generateKeyPairSigner(),
        callRpc: async (method, operation) => { calls.push(method); return operation(); },
        now: () => new Date(times.shift() ?? 'invalid'),
      }, { allowLoopbackHttp: true });
      expect(calls).toEqual(['getLatestBlockhash', 'sendTransaction']);
      expect(requests.map(value => value.method)).toEqual(['getLatestBlockhash', 'sendTransaction']);
      expect(requests[1]?.params[1]).toMatchObject({ encoding: 'base64', maxRetries: 0, preflightCommitment: 'confirmed', skipPreflight: false });
      expect(result.submission).toMatchObject({
        outcome: 'RPC_ACKNOWLEDGED', attempt_number: 1, blockhash_context_slot: 123,
        last_valid_block_height: 456, created_at: expectedTimes[0], submitted_at: expectedTimes[1], response_at: expectedTimes[2],
      });
      expect(result.signature).toBe(signatureFromWire(result.wireTransactionBase64));
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)));
    }
  });

  test('does not retry an ambiguous submission failure', async () => {
    let sends = 0;
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { id: string; method: string };
      if (body.method === 'sendTransaction') {
        sends += 1;
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32005, message: 'ambiguous upstream failure' } }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {
        context: { slot: 123 }, value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 456 },
      } }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const bound = server.address();
      if (bound === null || typeof bound === 'string') throw new Error('test server did not bind');
      const identity = {
        experimentId: 'm2-rehearsal-test', experimentVersion: '1', phase: 'healthy' as const,
        observerId: 'observer-aws-a', routeId: 'alchemy-solana-devnet', transactionClass: 'MATCHED_CONTROL' as const, probeIndex: 0,
      };
      const unit = { ...identity, unitId: deriveUnitId(identity) };
      await expect(submitM2RehearsalProbe({
        endpoint: `http://127.0.0.1:${bound.port}`,
        unit,
        feePayer: await generateKeyPairSigner(),
        callRpc: async (_method, operation) => operation(),
      }, { allowLoopbackHttp: true })).rejects.toThrow();
      expect(sends).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)));
    }
  });
});

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function signatureFromWire(encoded: string): string {
  const bytes = Buffer.from(encoded, 'base64').subarray(1, 65);
  let value = BigInt(`0x${bytes.toString('hex')}`);
  let output = '';
  while (value > 0n) { output = ALPHABET[Number(value % 58n)] + output; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; output = `1${output}`; }
  return output;
}
