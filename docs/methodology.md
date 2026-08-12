# Measurement Methodology v0.1

## Research question

Can controlled, matched probes distinguish broad degradation of a logical submission route from asymmetric degradation affecting one declared transaction class?

## Primary statistical unit

```text
experiment × observer × route × transaction_class × probe_index
```

Each unit has one unique signed transaction and signature. Retries, reader claims, and lifecycle events belong to that unit; they are not additional independent samples.

## Pairing

For each `probe_index`, the builder produces one transaction for every route/class combination. Transactions are unique, not byte-identical, but share the same experiment configuration and matched structural profile. Submission order is randomized within a bounded pairing window and the realized order is stored.

The initial classes vary primarily by a one-byte discriminator. Accounts, signer structure, instruction-data length, serialized size, compute limit, compute behavior, and fee profile must match within documented tolerances.

## ExperimentDefinition commitments

The controlled v0.1 profile is fixed as follows:

| Setting | Value | Rationale |
|---|---|---|
| blockhash commitment | `confirmed` | Recent while avoiding the higher fork exposure of `processed` |
| preflight commitment | `confirmed` | Must match the blockhash commitment |
| skip preflight | `false` | Preserve explicit simulation/signature failures |
| max RPC retries | `0` | Avoid hidden rebroadcast changing the measured submission path |
| min context slot | blockhash response context slot | Prevent submission to a reader behind the blockhash context |
| transaction encoding | `base64` | Current standard RPC encoding |
| execution observation | quorum status `processed` or stronger | Earliest ledger observation; never inferred from submission response |
| confirmation target | quorum status `confirmed` or stronger | Primary success endpoint |
| finalization target | quorum status `finalized` | Recorded separately |
| expiration | quorum `getBlockHeight(confirmed) > lastValidBlockHeight` with no execution quorum | Block-height-based, not wall-clock timeout |

`getSignatureStatuses` has no commitment parameter. Readers store its returned `confirmationStatus`, `slot`, and `err`. A timeout alone cannot produce `EXPIRED`.

## Observation quorum algorithm

1. Poll all three readers independently for the signature.
2. Preserve every response with reader ID, local monotonic offset, wall time, context slot, status, slot, and error.
3. Two compatible non-null status reports establish observation.
4. Two reports with `err = null` establish `OBSERVED_EXECUTION_SUCCESS`; two with equivalent non-null execution errors establish `OBSERVED_EXECUTION_FAILED`.
5. Two reports at `confirmed` or stronger establish `CONFIRMED`; two at `finalized` establish `FINALIZED`.
6. Two block-height reports above `lastValidBlockHeight`, with no reader reporting execution, establish `EXPIRED`.
7. Contradiction or failure to establish any terminal decision by the experiment deadline yields `OBSERVATION_INCONCLUSIVE`.

Because local readers share one validator in the first experiment, their agreement is logical redundancy, not proof from independent validators.

## Windows and aggregation

The first experiment uses count-bounded windows, not free-running wall-clock windows:

- one phase (`baseline`, `selective_reject`, or `general_degradation`);
- one experiment ID and configuration hash;
- exactly the declared `probe_index` range;
- group key: experiment, observer, route, class, phase;
- late results are included only in a recomputed version of the window.

Rates use one terminal outcome per valid statistical unit. A complete unit has a terminal result, including `EXPIRED`, execution failure, or `OBSERVATION_INCONCLUSIVE`; structurally mismatched units are invalid exclusions and never silently disappear. Retries do not increase the denominator. The summary reports counts, proportions, absolute gaps, Wilson 95% intervals, missingness, inconclusive count, and configuration hash. Wilson intervals are descriptive evidence, not causal confidence.

## ClassificationPolicyV0Experimental

For the deterministic controlled experiment:

- minimum complete units per route/class/window: 30;
- eligibility guard: if any required cell has an inconclusive rate above 0.10, classify `UNKNOWN` and report a data-quality failure;
- `HEALTHY`: control success ≥ 0.90, test success ≥ 0.90, absolute class gap ≤ 0.10;
- `DEGRADED`: control success ≤ 0.40, test success ≤ 0.40, absolute class gap ≤ 0.20;
- `ASYMMETRIC`: control success ≥ 0.90, route test success ≤ 0.20, peer test baseline ≥ 0.90, control-test gap ≥ 0.60, peer-test gap ≥ 0.60;
- `INSUFFICIENT_DATA`: either required class has fewer than 30 complete units;
- otherwise `UNKNOWN`.

Success means `CONFIRMED` with execution success. `RPC_ACKNOWLEDGED`, pending, expired, execution failure, and inconclusive are not successes and are reported separately. Peer baseline is the pooled test-class result from eligible peer routes in the same phase/configuration; leave-one-route-out is mandatory.

Classification precedence is: `INSUFFICIENT_DATA`, data-quality guard to `UNKNOWN`, `DEGRADED`, `ASYMMETRIC`, `HEALTHY`, `UNKNOWN`. This prevents reader failure from masquerading as route failure and prevents low controls from becoming asymmetric.

`evidence_strength` is descriptive:

- `INSUFFICIENT`: classification is `INSUFFICIENT_DATA`;
- `LIMITED`: threshold passes but any required cell has fewer than 60 units;
- `STRONG_CONTROLLED`: threshold passes and every required cell has at least 60 units.

It is not a calibrated probability and must not be labeled confidence.

## Bias controls

- Randomize route/class submission order within each probe index.
- Bound the pairing interval and report breaches.
- Use unique fee-payer-derived nonce data or probe account state while keeping structure matched.
- Pin validator, program, proxy, builder, policy, and schema versions.
- Preserve preflight and RPC errors without relying solely on provider text.
- Report reader disagreement and missingness.
- Do not combine phases or configuration hashes.

## Interpretation

Passing the controlled experiment validates the measurement pipeline under a known intervention. It does not estimate real-world false-positive rates, prove intent, or establish provider behavior.

## Official API references

- [Solana `sendTransaction`](https://solana.com/docs/rpc/http/sendtransaction)
- [Solana `getSignatureStatuses`](https://solana.com/docs/rpc/http/getsignaturestatuses)
- [Solana `getLatestBlockhash`](https://solana.com/docs/rpc/http/getlatestblockhash)
- [Solana `getBlockHeight`](https://solana.com/docs/rpc/http/getblockheight)
- [Solana transaction confirmation and expiration](https://solana.com/developers/guides/advanced/confirmation)
