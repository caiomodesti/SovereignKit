# ADR-005: Observation quorum

- Status: Accepted
- Date: 2026-08-10

## Decision

Use three logical readers and require two compatible claims for observation, execution outcome, confirmation, finalization, or expiration. Readers are distinct from the route-under-test client.

## Consequences

One reader failure is tolerated. In the initial topology the readers share a local validator, so this is logical redundancy rather than operational, validator, or Byzantine independence. Conflicts without quorum are inconclusive.
