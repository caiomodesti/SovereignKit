import {
  createSolanaRpc,
  type Base64EncodedWireTransaction,
  type KeyPairSigner,
  type Signature,
} from '@solana/kit';

import { buildSignedProbe } from './builder.js';
import { sha256Hex } from './canonical.js';
import type { ProbeDefinition, ProbeSubmission, ProbeUnit } from './types.js';

export const M2_REHEARSAL_PROGRAM_ADDRESS = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

type RpcMethod = 'getLatestBlockhash' | 'sendTransaction';
type RpcCall = <T>(method: RpcMethod, operation: () => Promise<T>) => Promise<T>;

export interface M2RehearsalSubmissionInput {
  readonly endpoint: string;
  readonly unit: ProbeUnit;
  readonly feePayer: KeyPairSigner;
  readonly callRpc: RpcCall;
  readonly now?: () => Date;
}

export interface M2RehearsalSubmissionResult {
  readonly signature: Signature;
  readonly wireTransactionBase64: Base64EncodedWireTransaction;
  readonly submission: ProbeSubmission;
}

export interface PreparedM2RehearsalProbe {
  readonly endpoint: string;
  readonly unitId: string;
  readonly signature: Signature;
  readonly wireTransactionBase64: Base64EncodedWireTransaction;
  readonly blockhash: string;
  readonly blockhashContextSlot: number;
  readonly lastValidBlockHeight: number;
  readonly serializedSizeBytes: number;
  readonly createdAt: string;
}

export interface M2RehearsalSubmissionOptions {
  readonly allowLoopbackHttp?: boolean;
}

export async function prepareM2RehearsalProbe(input: M2RehearsalSubmissionInput, options: M2RehearsalSubmissionOptions = {}): Promise<PreparedM2RehearsalProbe> {
  const endpoint = new URL(input.endpoint);
  const loopbackHttp = options.allowLoopbackHttp === true && endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname);
  if ((!loopbackHttp && endpoint.protocol !== 'https:') || endpoint.username !== '' || endpoint.password !== '') throw new Error('M2 submission endpoint must use HTTPS outside loopback tests');
  if (input.unit.transactionClass !== 'MATCHED_CONTROL' || input.unit.phase !== 'healthy') throw new Error('M2 rehearsal submission accepts only the frozen unit class and phase');
  const now = input.now ?? (() => new Date());
  const rpc = createSolanaRpc(endpoint.toString());
  const latest = await input.callRpc('getLatestBlockhash', () => rpc.getLatestBlockhash({ commitment: 'confirmed' }).send());
  const definition: ProbeDefinition = {
    experimentId: input.unit.experimentId,
    experimentVersion: input.unit.experimentVersion,
    phase: input.unit.phase,
    observerId: input.unit.observerId,
    routeIds: [input.unit.routeId],
    transactionClasses: ['MATCHED_CONTROL'],
    probeIndices: [input.unit.probeIndex],
    randomizationSeed: input.unit.unitId,
    pairingWindowMs: 10_000,
    programAddress: M2_REHEARSAL_PROGRAM_ADDRESS,
    computeUnitLimit: 20_000,
    computeUnitPriceMicroLamports: 0n,
    expectedComputeUnits: { MATCHED_CONTROL: 5_000, PROGRAM_X: 5_000 },
    feePayerPolicy: 'one-prefunded-disposable-devnet-payer',
    blockhashCommitment: 'confirmed',
    preflightCommitment: 'confirmed',
    skipPreflight: false,
    maxRetries: 0,
  };
  const built = await buildSignedProbe(definition, input.unit, {
    feePayer: input.feePayer,
    lifetime: {
      blockhash: latest.value.blockhash,
      lastValidBlockHeight: latest.value.lastValidBlockHeight,
      contextSlot: latest.context.slot,
    },
  });
  const createdAt = canonicalNow(now);
  return {
    endpoint: endpoint.toString(),
    unitId: input.unit.unitId,
    signature: built.signature,
    wireTransactionBase64: built.wireTransactionBase64 as Base64EncodedWireTransaction,
    blockhash: built.blockhash,
    blockhashContextSlot: Number(built.blockhashContextSlot),
    lastValidBlockHeight: Number(built.lastValidBlockHeight),
    serializedSizeBytes: built.fingerprint.serializedSizeBytes,
    createdAt,
  };
}

export async function submitPreparedM2RehearsalProbe(
  prepared: PreparedM2RehearsalProbe,
  callRpc: RpcCall,
  now: () => Date = () => new Date(),
): Promise<M2RehearsalSubmissionResult> {
  const rpc = createSolanaRpc(prepared.endpoint);
  const submittedAt = canonicalNow(now);
  const returned = await callRpc('sendTransaction', () => rpc.sendTransaction(
    prepared.wireTransactionBase64,
    {
      encoding: 'base64',
      maxRetries: 0n,
      minContextSlot: BigInt(prepared.blockhashContextSlot),
      preflightCommitment: 'confirmed',
      skipPreflight: false,
    },
  ).send());
  const responseAt = canonicalNow(now);
  if (returned !== prepared.signature) throw new Error('M2 submission RPC returned a different signature');
  return {
    signature: prepared.signature,
    wireTransactionBase64: prepared.wireTransactionBase64,
    submission: {
      attempt_id: shaAttempt(prepared.unitId),
      attempt_number: 1,
      outcome: 'RPC_ACKNOWLEDGED',
      blockhash: prepared.blockhash,
      blockhash_context_slot: prepared.blockhashContextSlot,
      last_valid_block_height: prepared.lastValidBlockHeight,
      serialized_size_bytes: prepared.serializedSizeBytes,
      created_at: prepared.createdAt,
      submitted_at: submittedAt,
      response_at: responseAt,
    },
  };
}

function canonicalNow(now: () => Date): string {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('M2 submission clock returned an invalid Date');
  return value.toISOString();
}

function shaAttempt(unitId: string): string {
  return sha256Hex(`${unitId}:attempt-1`);
}
