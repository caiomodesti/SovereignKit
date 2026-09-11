import { SolanaKitObservationReader } from '../../packages/telemetry/dist/solana-rpc.js';

const EXPECTED_IDS = [
  'grant-m2-reader-public-a',
  'grant-m2-reader-alchemy',
  'grant-m2-reader-public-b',
];

export function createGrantM2BudgetedReaders({ registry, budget, readerFactory = (readerId, endpoint) => new SolanaKitObservationReader(readerId, endpoint) }) {
  if (registry?.schemaVersion !== 'ObservationReaderRegistry@0.1.0' || !Array.isArray(registry.readers) ||
      registry.readers.length !== EXPECTED_IDS.length || typeof budget?.callWhenAvailable !== 'function') {
    throw Error('Invalid M2 budgeted reader configuration');
  }
  return registry.readers.map((entry, index) => {
    if (entry?.readerId !== EXPECTED_IDS[index] || typeof entry.endpoint !== 'string') throw Error('M2 reader registry drift');
    const endpoint = new URL(entry.endpoint);
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname))) {
      throw Error(`reader ${entry.readerId} must use HTTPS outside loopback development`);
    }
    const reader = readerFactory(entry.readerId, endpoint.toString());
    if (entry.readerId !== 'grant-m2-reader-alchemy') return reader;
    return {
      readerId: reader.readerId,
      async getSignatureStatus(signature, abortSignal) {
        return unwrap(await budget.callWhenAvailable('getSignatureStatuses', () => reader.getSignatureStatus(signature, abortSignal), { abortSignal }));
      },
      async getBlockHeight(abortSignal) {
        return unwrap(await budget.callWhenAvailable('getBlockHeight', () => reader.getBlockHeight(abortSignal), { abortSignal }));
      },
    };
  });
}

function unwrap(result) {
  if (!result.allowed) throw Error(`RPC budget blocked: ${result.reason}`);
  return result.value;
}

