# Measurement Model v0.1

## Design rules

- Store observed facts before derived states.
- Use stable IDs and schema versions everywhere.
- One statistical unit has one unique signature.
- Preserve raw coded errors; normalized categories are additional fields.
- Durations use a local monotonic clock; cross-host ordering uses wall clocks with explicit uncertainty.
- Nullable means “not observed or not applicable,” never implicit failure.

## Core entities

### Route

```text
route_id
route_revision
logical_endpoint
transport
observer_region
configuration_profile
provider_label?
enabled
created_at
```

Endpoint secrets are referenced by secret ID and never persisted in public measurement data.

### Observer

```text
observer_id
public_key
region
version
capabilities[]
allowlist_status
```

### ExperimentDefinition

Contains the experiment ID/version, environment, routes, readers, classes, probe range, randomization seed, pairing limits, blockhash/preflight/send settings, observation quorum, deadlines, window definition, classification policy, and component version pins. Its canonical JSON hash is stored in every result.

### ProbeDefinition

Declares `transaction_class`; the MVP does not infer a class from arbitrary user transactions. It defines the test program, discriminator, account layout, signer layout, instruction-data length, compute budget, fee profile, and expected execution behavior.

### StatisticalUnit

```text
experiment_id
experiment_version
phase
observer_id
route_id
transaction_class
probe_index
unit_id
```

`unit_id` is a deterministic hash of the six-dimensional primary key plus phase/version. Its uniqueness is enforced.

### SubmissionAttempt

```text
attempt_id
unit_id
attempt_number
route_id
signature
blockhash
blockhash_context_slot
last_valid_block_height
serialized_size_bytes
compute_unit_limit
compute_unit_price_micro_lamports
created_wall_time
created_monotonic_ns
submitted_wall_time
submitted_monotonic_ns
response_wall_time?
response_monotonic_ns?
rpc_outcome
rpc_error_code?
rpc_error_category?
rpc_error_message_redacted?
```

The initial controlled experiment allows one attempt per unit. Later retry policies must retain all attempts without treating them as samples.

### ReaderClaim

```text
claim_id
unit_id
reader_id
observed_wall_time
observed_monotonic_ns
rpc_context_slot?
signature_status: null | processed | confirmed | finalized
transaction_slot?
execution_error?
observed_block_height?
reader_error?
```

### QuorumDecision

```text
decision_id
unit_id
decision_type
supporting_claim_ids[]
dissenting_claim_ids[]
decided_at
quorum_rule_version
```

### ProbeResult

Envelope signed by the observer:

```text
schema_version
result_id
idempotency_key
observer_id
observer_sequence
unit_id
experiment_definition_hash
submission_attempt
reader_claims[]
quorum_decisions[]
terminal_lifecycle_state
observer_wall_time
collector_received_at   # added by collector, outside signed observer payload
payload_hash
observer_signature
```

Canonicalization uses RFC 8785 JSON Canonicalization Scheme before hashing/signing. The collector verifies the signature over the canonical payload excluding `observer_signature` and collector-added fields.

## Lifecycle projection

The lifecycle is append-only and ordered per unit:

```text
CREATED
  -> SUBMISSION_ATTEMPTED
      -> RPC_REJECTED
      |   -> OBSERVATION_PENDING
      -> RPC_ACKNOWLEDGED
          -> OBSERVATION_PENDING

OBSERVATION_PENDING
  -> OBSERVED_EXECUTION_SUCCESS
  |    -> CONFIRMED -> FINALIZED
  -> OBSERVED_EXECUTION_FAILED
  |    -> CONFIRMED -> FINALIZED
  -> EXPIRED
  -> OBSERVATION_INCONCLUSIVE
```

Important qualifications:

- An RPC rejection does not prove the transaction was never forwarded; observation still runs when a valid signature exists.
- `CONFIRMED` and `FINALIZED` carry the execution outcome; they do not overwrite it.
- `EXPIRED` requires block-height quorum and absence of observed execution.
- `OBSERVATION_INCONCLUSIVE` is not equivalent to failure or dropped.

## Idempotency

- `unit_id` prevents duplicate statistical units.
- `attempt_id` prevents duplicate attempts.
- `claim_id` prevents duplicate reader claims.
- `result_id` prevents duplicate envelopes.
- `idempotency_key = sha256(observer_id || unit_id || result_revision)`.
- Exact replays are acknowledged without reinsertion; conflicting payloads for the same key are quarantined.

## Derived artifacts

Window metrics, classifications, intelligence snapshots, and summaries include their input IDs, generator version, policy version, and content hash. They are replaceable projections; raw facts are not mutated.
