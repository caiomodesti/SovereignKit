# SovereignKit documentation

This index separates normative contracts, implementation design, reproducible evidence, and historical sprint acceptance records.

## Start here

1. [Product specification](product-spec.md)
2. [Architecture](architecture.md)
3. [Methodology](methodology.md)
4. [Measurement model](measurement-model.md)
5. [Epistemic limits](epistemic-limits.md)
6. [Threat model](threat-model.md)
7. [Roadmap](roadmap.md)

## Normative experiment contracts

- [Demo and experiment contract](demo-contract.md)
- [Route and measurement model](measurement-model.md)
- [Transaction classes](transaction-classes.md)
- [Observation and telemetry core](telemetry-core.md)
- [Observer identities](observer-identities.md)
- [GO/KILL checkpoint](go-kill-checkpoint.md)
- [Architecture decisions](adr/README.md)

## Components

- [Probe Engine](probe-engine.md)
- [Reactive Router](reactive-router.md)
- [Controlled Hostile Proxy](controlled-hostile-proxy.md)
- [Collector](collector.md)
- [Intelligence feed](intelligence-feed.md)
- [Dashboard](dashboard.md)
- [Probe-informed routing](probe-informed-routing.md)

## Reproduce accepted evidence

- [Sprint 1.5 — live validator lifecycle](sprint-1.5-reproduction.md)
- [Sprint 3 — real fallback routing](sprint-3-reproduction.md)
- [Sprint 4 — controlled proxy behavior](sprint-4-reproduction.md)
- [Sprint 5 — controlled experiment](sprint-5-reproduction.md)
- [Sprint 6 — durable Collector](sprint-6-reproduction.md)
- [Sprint 7 — intelligence feed](sprint-7-reproduction.md)
- [Sprint 8 — local evidence dashboard](sprint-8-reproduction.md)
- [Sprint 9 — probe-informed route ordering](sprint-9-reproduction.md)

## Hostile audits and acceptance

The repository keeps sprint-level acceptance and hostile audits so a later implementation cannot silently rewrite what was actually proven.

| Sprint | Acceptance | Hostile audit |
|---|---|---|
| 0 | [acceptance](sprint-0-acceptance.md) | [audit](sprint-0-audit.md) |
| 1 | [acceptance](sprint-1-acceptance.md) | [audit](sprint-1-audit.md) |
| 1.5 | [acceptance](sprint-1.5-acceptance.md) | included in acceptance record |
| 3 | [acceptance](sprint-3-acceptance.md) | acceptance limitations |
| 4 | [acceptance](sprint-4-acceptance.md) | proxy security contract |
| 5 | [acceptance](sprint-5-acceptance.md) | [hostile audit](sprint-5-hostile-audit.md) |
| 6 | [acceptance](sprint-6-acceptance.md) | [hostile audit](sprint-6-hostile-audit.md) |
| 7 | [acceptance](sprint-7-acceptance.md) | [hostile audit](sprint-7-hostile-audit.md) |
| 8 | [acceptance](sprint-8-acceptance.md) | [hostile audit](sprint-8-hostile-audit.md) |
| 9 | [acceptance](sprint-9-acceptance.md) | [hostile audit](sprint-9-hostile-audit.md) |

## Product and commercial context

- [Commercial thesis v0.1](commercial-thesis-v0.1.md)
- [Dashboard contract](dashboard.md)
- [Current claim limits](epistemic-limits.md)
