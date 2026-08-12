# ADR-004: Declared matched transaction classes

- Status: Accepted
- Date: 2026-08-10

## Decision

`TransactionClass` is declared by the controlled ProbeDefinition/Builder. The initial program exposes `MATCHED_CONTROL` and `PROGRAM_X`, designed to differ primarily by discriminator while matching accounts, signers, size, compute, and fees.

Generic semantic classification of user transactions is deferred.

## Consequences

The experiment has a defensible controlled label but the SDK cannot yet apply proactive class-specific routing to arbitrary user transactions without an explicit developer-supplied class.
