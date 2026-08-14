# Sprint 10 — Devnet integration validation

## Boundary

Sprint 10 validates the current Solana RPC integration and operational behavior on
Devnet. It is not the controlled statistical proof, does not estimate Mainnet
performance, and does not publish provider rankings.

The official RPC contract states that `sendTransaction` success only means that an
RPC accepted the signed transaction for relay. It does not guarantee processing or
confirmation. SovereignKit therefore preserves `RPC_ACKNOWLEDGED` as a submission
event and derives landing only from later reader observations.

Primary references:

- [sendTransaction](https://solana.com/docs/rpc/http/sendtransaction)
- [getLatestBlockhash](https://solana.com/docs/rpc/http/getlatestblockhash)
- [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses)
- [getBlockHeight](https://solana.com/docs/rpc/http/getblockheight)
- [getVersion](https://solana.com/docs/rpc/http/getversion)
- [getGenesisHash](https://solana.com/docs/rpc/http/getgenesishash)
- [requestAirdrop](https://solana.com/docs/rpc/http/requestairdrop)

## Frozen validation profile

| Concern | Value |
|---|---|
| Default submission endpoint | `https://api.devnet.solana.com` |
| Transaction | unique legacy System Program transfer |
| Keypairs | recipient generated in memory; fee payer generated in memory or loaded from an ignored disposable file |
| Funding setup | 10,000,000-lamport confirmed airdrop (at most 5 attempts), or confirmed balance on a disposable keypair |
| Transfer | 1,000,000 lamports |
| Blockhash commitment | `confirmed` |
| Preflight | enabled, `confirmed` |
| Send retries | 5 |
| Observation | 3 logical readers, quorum 2/3 |
| Poll interval | 3,000 ms to remain below public per-method rate limits |
| Final evidence | finalized signature status and recipient balance |
| Raw truth | append-only JSONL |

Even when three distinct reader URLs are configured, this validation records
operational independence as **not established**. Provider names or URL diversity
cannot prove separate infrastructure, ownership, upstreams, or failure domains.

## Reproduction

PowerShell:

```powershell
$env:SOVEREIGNKIT_DEVNET = "1"
$env:SOVEREIGNKIT_ARTIFACT_DIR = "artifacts/sprint-10/devnet-$(Get-Date -Format yyyyMMddTHHmmssZ)"
corepack pnpm check:devnet:integration
corepack pnpm test:devnet
```

When the public faucet is unavailable, use a disposable pre-funded Devnet keypair.
Never use a Mainnet wallet or commit the keypair file:

```powershell
$env:SOVEREIGNKIT_DEVNET_FEE_PAYER_KEYPAIR = ".secrets/sprint-10-devnet-fee-payer.json"
```

The evidence records the funding mode, public address and starting balance but never
the keypair path or secret bytes.

Optional reader endpoints (exactly three comma-separated URLs):

```powershell
$env:SOVEREIGNKIT_DEVNET_READER_ENDPOINTS = "https://reader-a.example,https://reader-b.example,https://reader-c.example"
```

Never commit API keys in endpoint URLs. Evidence stores only URL origins and strips
paths, query strings, credentials, and fragments.

Expected artifacts:

- `raw-events.jsonl`
- `timeline.json`
- `timeline.txt`
- `evidence.json`

The public Devnet endpoint and faucet are rate-limited external dependencies. A
rate-limit or airdrop failure blocks the live acceptance run; it must not be
translated into a healthy or asymmetric finding.

## Acceptance gate

Sprint 10 passes only when a retained live run proves all of the following:

1. cluster genesis hash, RPC version, and slots were captured;
2. a unique real transaction was signed with ephemeral keys;
3. `RPC_ACKNOWLEDGED` remained separate from ledger observation;
4. raw events deterministically reconstruct the derived timeline;
5. logical quorum 2/3 observed execution, confirmation, and finalization;
6. finalized signature status and recipient balance agree;
7. blockhash and `lastValidBlockHeight` were retained;
8. no secret endpoint material was persisted;
9. limitations on reader independence, faucet reliability, resets, and rate limits
   are explicit;
10. build, typecheck, unit tests, integration typecheck, and the opt-in live test pass.

Until the retained live evidence exists and is audited, Sprint 10 remains
**IN PROGRESS** and Sprint 11 must not begin.
