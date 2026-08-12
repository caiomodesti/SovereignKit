# SovereignKit

Solana can remain healthy while a user's path to Solana fails.

SovereignKit is an open-source transaction accessibility observatory and resilient routing SDK for Solana. It measures route-level transaction accessibility, compares matched transaction classes, detects asymmetric route behavior, and helps applications route around paths that fail.

> **Status:** v0.1, Sprint 1.5 Live Validator Integration Proof complete. No classifier, hostile proxy, dashboard, or public Observatory infrastructure exists yet.

## What it measures

SovereignKit records what a logical submission route acknowledges, what an independent observation quorum later sees in the ledger, and how matched workloads differ across routes, observers, and explicit time windows.

The primary scientific claim is deliberately narrow: controlled measurements can distinguish broad route degradation from asymmetric behavior affecting a declared transaction class.

## What it does not claim

SovereignKit does not prove censorship intent, identify a validator that deliberately excluded a transaction, observe every internal forwarding hop, or guarantee inclusion. `RPC_ACKNOWLEDGED` never means that a transaction landed.

See [epistemic limits](docs/epistemic-limits.md) for the normative claim boundary.

## v0.1 architecture

- **Probe Builder:** produces unique but methodologically matched transactions.
- **Observer:** submits probes from a declared region and signs results.
- **Route:** a logical submission perspective, not a claim about a physical machine or path.
- **Observation Quorum:** three logical readers; two matching observations are required.
- **Collector:** validates allowlisted observer signatures and idempotency keys.
- **Analysis:** derives windowed metrics using `ClassificationPolicyV0Experimental`.
- **SDK:** later consumes a versioned polling snapshot and fails open to local primary/fallback policy.

The controlled experiment uses a local validator, a project-owned test program, and controlled proxies. Devnet is reserved for later integration validation.

## Sprint 0 artifacts

- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Methodology](docs/methodology.md)
- [Measurement model](docs/measurement-model.md)
- [Transaction classes](docs/transaction-classes.md)
- [Threat model](docs/threat-model.md)
- [Epistemic limits](docs/epistemic-limits.md)
- [Demo and experiment contract](docs/demo-contract.md)
- [GO/KILL checkpoint](docs/go-kill-checkpoint.md)
- [Sprint 0 audit](docs/sprint-0-audit.md)
- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/adr/)
- Machine-readable contracts in [`spec/`](spec/)

## Sprint 1 Telemetry Core

`@sovereignkit/telemetry` records append-only measurement facts and deterministically derives a transaction timeline. It includes:

- separate submission and ledger-observation facts;
- logical 2/3 observation quorum over three readers;
- block-height-based expiration;
- local monotonic latency calculation;
- in-memory and JSONL append-only stores;
- current `@solana/kit` submission and observation adapters;
- deterministic examples for healthy, rejection, execution failure, expiration, and inconclusive observation.

```text
pnpm env:doctor:core
pnpm check
pnpm test
pnpm test:coverage
pnpm build
pnpm examples:timelines
```

The complete environment doctor also checks the pinned Rust and Agave tools:

```text
. scripts/use-pinned-toolchain.ps1
pnpm env:doctor
```

See the [Telemetry Core design](docs/telemetry-core.md), [produced timelines](docs/sprint-1-timelines.md), and [Sprint 1 acceptance audit](docs/sprint-1-acceptance.md).

## Sprint 1.5 Live Validator Integration Proof

The Telemetry Core has been exercised against a real local Agave 4.0.0 validator. A real legacy System Program transfer was RPC-acknowledged, independently polled by three logical readers, confirmed, finalized, and verified by finalized recipient balance. The readers share one local process, so this proves logical quorum semantics rather than infrastructure independence.

See the [Sprint 1.5 acceptance and hostile audit](docs/sprint-1.5-acceptance.md), [reproduction procedure](docs/sprint-1.5-reproduction.md), and committed [healthy fixture](fixtures/integration/agave-4.0.0/healthy/).

## First experiment reproduction contract

Sprint 0 defines, but intentionally does not implement, the first experiment. After Sprint 1–5 components exist, the canonical flow will be:

```text
pnpm demo:reset
pnpm demo:start
pnpm demo:deploy-test-program
pnpm demo:baseline
pnpm demo:enable-selective-reject
pnpm demo:run-probes --experiment controlled-selective-reject-v0.1
pnpm demo:classify
pnpm demo:summary
pnpm demo:verify
```

The expected artifacts are immutable raw measurements plus Markdown, JSON, and CSV experiment summaries. These commands are a contract for later sprints and are not available in Sprint 0.

## Current Solana API basis

The v0.1 design uses the recommended TypeScript SDK, [`@solana/kit`](https://github.com/anza-xyz/kit), and the current Solana JSON-RPC contracts for [`sendTransaction`](https://solana.com/docs/rpc/http/sendtransaction), [`getSignatureStatuses`](https://solana.com/docs/rpc/http/getsignaturestatuses), [`getLatestBlockhash`](https://solana.com/docs/rpc/http/getlatestblockhash), and [`getBlockHeight`](https://solana.com/docs/rpc/http/getblockheight).

## License

Apache-2.0. See [LICENSE](LICENSE).
