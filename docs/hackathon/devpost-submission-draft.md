# QuantumHacks submission draft

## Project name

SovereignKit — Proof Before Routing

## Tagline

An RPC accepted your Solana transaction. SovereignKit proves whether it landed
and shows which fallback restored execution.

## Short description

SovereignKit is open-source reliability infrastructure for Solana transaction
submission. It separates an RPC acknowledgment from independent ledger
observation, preserves signed append-only evidence, distinguishes broad route
degradation from reproducible class-selective behavior, and gives applications
a bounded fail-open router.

The project includes a controlled local experiment with unique matched
transactions, a 2-of-3 logical observation quorum, four reproducible outcomes,
an experimental evidence-derived classifier, a versioned intelligence
snapshot, a read-only evidence console, and a real finalized Devnet integration
proof.

## Problem

Wallets and protocols often treat a successful JSON-RPC response as if the
transaction landed. That collapses submission, execution observation,
confirmation, and finalization into one misleading signal. During an incident,
teams also struggle to tell whether every workload is degraded or one declared
transaction class is affected differently.

## What we built

- append-only lifecycle telemetry where `RPC_ACKNOWLEDGED` never means landing;
- unique structurally matched `MATCHED_CONTROL` and `PROGRAM_X` probes;
- signed observer results with idempotent collector ingestion;
- explicit windows and `ClassificationPolicyV0Experimental`;
- reproducible HEALTHY, DEGRADED, ASYMMETRIC, and INSUFFICIENT_DATA scenarios;
- bounded reactive routing with stale-feed fail-open behavior;
- a static guided incident replay derived only from accepted fixtures;
- one real Devnet transaction observed through FINALIZED.

## Impact

SovereignKit gives wallet, protocol, custody, trading, and RPC reliability teams
a falsifiable incident record instead of a green RPC response. The commercial
hypothesis is open-core B2B infrastructure: an Apache-licensed SDK and
methodology, with a future managed private intelligence, alerting, retention,
and enterprise-assurance service. This hypothesis is not yet validated revenue.

## Honest boundary

v0.1 is a controlled proof and Devnet integration validation. It is not a
censorship oracle, provider ranking, Mainnet benchmark, or decentralized
observer network. Local readers demonstrate logical redundancy, not operational
infrastructure independence.

## Technologies

Solana/Agave, Rust, TypeScript, Node.js, React, Vite, Vitest, Ed25519, JSON
Schema, JSONL, Markdown, canonical JSON, and CSV.

