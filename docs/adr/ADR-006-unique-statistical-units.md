# ADR-006: Unique matched transactions per statistical unit

- Status: Accepted
- Date: 2026-08-10

## Decision

The primary unit is experiment × observer × route × transaction class × probe index. Every unit has its own signed transaction and signature. Comparative routes never receive the same signed transaction.

## Consequences

Cross-route landing cannot contaminate another unit. The builder must guarantee uniqueness without changing the declared matching dimensions, and retries remain nested attempts rather than new samples.
