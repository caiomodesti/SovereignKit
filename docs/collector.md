# Observer and Collector hardening v0.1

## Scope

Sprint 6 turns the Sprint 2 ingestion fixture into a local, operationally separated evidence path. It does not create a public service, decentralized observer network, geographic independence, database cluster, dashboard, or intelligence feed.

## Write path

The loopback Collector accepts `POST /v0/probe-results` and processes unknown JSON in this order:

1. enforce HTTP method, content type, loopback client, a 256 KiB body bound, and bounded HTTP timings;
2. parse JSON;
3. validate the complete payload against `probe-result.schema.json` Draft 2020-12;
4. validate derived unit, idempotency, quorum, and terminal-state invariants;
5. resolve the observer/key allowlist entry and its validity interval;
6. verify payload hash and Ed25519 signature;
7. detect exact duplicates and identifier/sequence conflicts;
8. append a collector envelope to JSONL and call `fsync`;
9. update the in-memory replay indexes only after durable synchronization.

The accepted JSONL is the primary raw Collector record. Each envelope adds a collector-assigned contiguous sequence and receipt time while retaining the signed result unchanged.

## Restart and corruption behavior

On startup the Collector reads the complete log, requires a final newline, validates every envelope and signed payload, reconstructs all replay indexes, and refuses sequence gaps, malformed JSON, schema-invalid records, invalid signatures, or duplicates. It never truncates or repairs evidence automatically.

If append or `fsync` fails, the active write path becomes poisoned and refuses subsequent ingestion until restart and log inspection. This prevents an uncertain write from being followed by a second append in the same process.

This is a single-writer local durability design. It is not safe for multiple Collector processes sharing a file and does not protect against a malicious host rewriting the log.

## Replay keys

- `result_id`: envelope identity;
- `idempotency_key`: deterministic `observer_id × unit_id` identity;
- `observer_sequence`: unique within `observer_id × experiment_definition_hash`;
- `collector_sequence`: contiguous accepted-record order assigned by one Collector log.

An exact replay is a successful no-op (`DUPLICATE`). A reused key with different canonical content is `REJECTED`.

## Observer process

The standalone Observer loads a versioned PKCS#8 Ed25519 private-key document, confirms that its public key matches, signs an unsigned ProbeResult, and submits it to the Collector. The private document is never printed or included in accepted evidence. Development secrets belong under `.secrets/`, which Git ignores.

The committed integration test requests mode `0600` where the filesystem supports POSIX modes, runs Observer and Collector as separate OS processes, destroys temporary secrets, restarts the Collector, and proves persistent replay detection. Windows deployments must configure an explicit ACL; the mode option alone is not an ACL control.

## Operational boundary

The HTTP process binds explicitly to `127.0.0.1`. There is no TLS, remote authorization, rate-limit service, multi-writer coordination, revocation service, HSM, or external anchoring. Do not expose this endpoint outside the controlled host.
