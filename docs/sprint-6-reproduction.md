# Sprint 6 reproduction

## Prerequisites

- Node.js 22.17.0 or another version allowed by the root engine range;
- Corepack;
- pnpm 11.16.0 as pinned by `packageManager`;
- no validator, network RPC, or private key is required for the retained-contract replay.

Install exactly the locked dependencies:

```powershell
corepack pnpm install --frozen-lockfile
```

Run the complete Sprint 6 verifier:

```powershell
corepack pnpm verify:sprint-6
```

That command performs:

1. complete workspace build;
2. all deterministic unit tests;
3. a typed integration test with standalone Observer and Collector child processes;
4. Collector shutdown and restart;
5. exact replay verification;
6. schema and Ed25519 verification of all 600 retained Sprint 5 ProbeResults;
7. fresh durable ingestion of all 600, restart reconstruction, and 600 duplicate no-ops.

The final contract-verifier line must be:

```json
{"schemaValidated":600,"signaturesVerified":600,"initiallyAccepted":600,"replayedAsDuplicate":600,"restoredAfterRestart":600}
```

Run coverage separately:

```powershell
corepack pnpm test:coverage
```

## Manual process entry points

After `pnpm build`, the processes accept:

```text
node packages/collector/dist/collector-process.js <schema.json> <allowlist.json> <accepted.jsonl> [port]
node packages/collector/dist/observer-process.js <private-key.json> <unsigned-result.json> <collector-url>
```

The integration test is the canonical executable example because it generates an ephemeral key safely, selects an available loopback port, performs the restart, and removes the private key afterward.
