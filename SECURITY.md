# Security policy

## Supported scope

SovereignKit v0.1 is pre-release research and developer infrastructure. Security review should focus on observer identity handling, signed payload validation, collector ingestion, route configuration, RPC boundaries, hostile-proxy isolation, snapshot validation, and fail-open behavior.

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Use GitHub's private vulnerability-reporting or security-advisory flow when it is enabled for this repository. If that flow is unavailable, contact the repository owner privately through GitHub before disclosing details.

Include:

- the affected package, version, or commit;
- prerequisites and a minimal reproduction;
- expected versus observed behavior;
- potential impact on evidence integrity, availability, signing keys, or routing;
- whether the issue requires a live validator or controlled fixture.

Never attach real private keys, seed phrases, provider credentials, or production transaction payloads.

## Current boundaries

- The controlled Hostile Proxy is loopback-only and is not a production network appliance.
- Local 2/3 readers provide logical redundancy, not infrastructure independence.
- The feed is not a public trust oracle; clients must validate snapshots and fail open.
- The experimental classifier is not a security verdict or proof of intent.

