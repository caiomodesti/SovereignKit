# ADR-008: Signed allowlisted observer results

- Status: Accepted
- Date: 2026-08-10

## Decision

Each observer owns an Ed25519 keypair. It signs RFC 8785-canonicalized ProbeResults carrying stable IDs, sequence, and idempotency protection. The MVP collector uses a public-key allowlist.

## Consequences

Origin and replay controls are available, but signatures do not prove truthful measurement. Central administration is explicit and the system is not described as decentralized.
