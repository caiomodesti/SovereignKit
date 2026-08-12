# Probe Engine v0.1

## Scope

`@sovereignkit/probes` implements only the Sprint 2 boundary: declarations, matched transaction construction, structural validation, reproducible randomized execution, signed `ProbeResult` payloads, and idempotent allowlisted ingestion fixtures. It does not submit probes, classify results, route failover, control a proxy, or deploy the project-owned test program.

## Statistical units

`declareProbeUnits` expands a `ProbeDefinition` into exactly one unit for each:

```text
experiment Ã— observer Ã— route Ã— transaction_class Ã— probe_index
```

`unit_id` is SHA-256 over the canonical tuple. The collector independently recomputes it. `TransactionClass` remains declared by the definition; no transaction-inspection classifier exists.

## Matched transaction construction

The builder creates a signed legacy Solana transaction with:

1. an identical compute-unit-limit instruction;
2. an identical compute-unit-price instruction;
3. one instruction to the declared controlled-program address containing a one-byte class discriminator and a 16-byte pair nonce.

Within a route Ã— probe-index pair, both classes use the same nonce and differ in the discriminator. Different routes use different nonces. Consequently every route Ã— class Ã— probe-index unit has different signed bytes and signature, while program, accounts, signer roles, instruction order, data lengths, serialized size, compute budget, fee-payer policy, blockhash configuration, and expected result stay matched.

Expected compute consumption is an explicit `ProbeDefinition` input, not a fabricated measurement. The structural validator enforces the v0.1 tolerance of 1% or 100 CU. The values must later come from profiling the project-owned program; Sprint 2 tests use equal declared values to validate mechanics only.

## Randomized execution

The deterministic HMAC-SHA-256 PRNG shuffles probe-index groups and then shuffles route/class order inside each group. Units from one probe index remain contiguous. The executor stores realized ordinals, start/completion timestamps, failures, per-index span, configured pairing window, and breach status. A callback failure is evidence and does not abort or silently remove later units.

## Observer authentication

Observer identities use dedicated Ed25519 keypairs unrelated to fee payers. Signing is:

1. canonicalize the unsigned result using locale-independent lexical key order;
2. SHA-256 that representation into `payload_hash`;
3. canonicalize the payload plus hash;
4. create an Ed25519 signature encoded as base64url.

Private keys remain non-serializable `KeyObject` instances in the public helper and are never included in fixtures. `observer_key_id` is now required by the versioned schema because signature verification and key rotation are impossible without it.

## Ingestion semantics

The in-memory Sprint 2 collector fixture checks basic schema invariants, derived unit and idempotency identifiers, allowlist membership, key validity at observation and collection, payload hash, observer signature, distinct supporting claims/readers, and terminal decision consistency.

- First valid payload: `ACCEPTED`.
- Exact transport replay: `DUPLICATE`, no new stored result.
- Reused result ID, idempotency key, or observer sequence with different content: `REJECTED`.
- Tampering, unknown/expired key, false quorum, or invalid derived IDs: `REJECTED`.

Full network collector hardening and exhaustive JSON Schema validation remain Sprint 6. This fixture must not be described as a decentralized network or production storage system.
