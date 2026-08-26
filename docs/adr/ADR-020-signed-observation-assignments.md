# ADR-020 — Signed observation assignments

Status: Accepted  
Date: 2026-08-25

## Context

The Milestone 1 observer can independently query three logical readers and sign
its derived ProbeResult. Before this decision, however, the observation job was
an unsigned JSON file. The raw reader log could corroborate ledger observation
but could not prove who authorized the job or whether its submission metadata
had been changed before execution.

## Decision

Every external Milestone 1 observation job must be wrapped in a short-lived
`ObservationAssignment@0.1.0` signed by a dedicated Ed25519 assignment
authority. Observers hold only an allowlisted public key for that authority.

Before any reader call, the observation worker must verify:

- issuer and key allowlisting;
- canonical payload SHA-256;
- Ed25519 signature;
- authority validity interval;
- assignment issue and expiry times;
- a maximum assignment validity window of 24 hours;
- the normal `ObservationJob` contract.

Every `RawObservationPoll@0.2.0` records the assignment ID and payload hash. The
Milestone 1 evidence index requires the signed assignment and correlates it with
the raw polls and signed ProbeResult.

The authority private key remains on the controlled coordinator host. It is not
an observer identity, payer wallet, user wallet, or grant-payment wallet.

## Consequences

- Job origin and post-authorization integrity become verifiable.
- A centrally fabricated unsigned ProbeResult cannot satisfy the acceptance
  bundle without a valid assignment and correlated raw polls.
- Assignment keys need separate custody, rotation, validity, and incident
  procedures.
- This does not prove that the issuer's submission metadata is true. It proves
  only who asserted it and that the assertion was not modified. Independent
  submission receipts or route-side evidence remain a residual requirement for
  stronger claims.
- Historical local evidence using unsigned jobs remains valid only for its
  previously frozen local-readiness claim; it cannot satisfy external
  Milestone 1 acceptance.
