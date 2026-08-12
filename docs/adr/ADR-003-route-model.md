# ADR-003: Route is a logical submission perspective

- Status: Accepted
- Date: 2026-08-10

## Decision

A route contains `route_id`, `logical_endpoint`, `transport`, `observer_region`, `configuration_profile`, and optional `provider_label`. It does not claim a one-to-one mapping to a machine, backend, provider, physical path, or geographic location.

## Consequences

Metrics describe the configured logical perspective. Material endpoint/configuration changes require a new revision, and public provider labels remain optional and policy-controlled.
