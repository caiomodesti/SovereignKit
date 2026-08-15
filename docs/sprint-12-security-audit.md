# Sprint 12 security, secrets, dependency, and privacy audit

Audit date: 2026-08-15  
Baseline: `e0f1dfa`  
Scope: repository, full Git history, JavaScript and Rust dependency locks,
local HTTP surfaces, outbound RPC/feed boundaries, CI, public fixtures, and
the static dashboard.

## Release-gate verdict

**PASS WITH DOCUMENTED LIMITATIONS** for a public source repository and a
static, read-only fixture demo. This is not approval to expose the collector,
hostile proxy, observer process, or intelligence feed as public services.

## Findings and remediation

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| S12-01 | High before remediation | No repository CI gate existed | Added least-privilege CI with immutable action SHAs, exact Node/pnpm/Rust versions, frozen lockfile, ignored install scripts, tests, builds, fixture verification, Rust tests, and dependency audit |
| S12-02 | Medium before remediation | Production dashboard emitted source maps | Disabled production source maps |
| S12-03 | Medium before remediation | Hosted-demo browser policy was unspecified | Routed HTML through the Worker and added CSP, frame denial, no-referrer, MIME sniffing protection, restrictive permissions policy, and no forms/analytics/backend; CSP is duplicated in a document meta policy as defense in depth |
| S12-04 | Medium before remediation | Public dataset validation was shallow and did not contain the Devnet proof | Added scenario identity checks, Devnet lifecycle/quorum validation, and deterministic derivation from the accepted fixture |
| S12-05 | Low before remediation | Secret checks were manual only | Added a deterministic tracked-file/path scanner and CI gate; retained manual history archaeology |
| S12-06 | Informational | Accepted evidence exposes public-chain identifiers and operator timestamps | Classified and documented in `data-privacy-v0.1.md`; no private or authenticated material found |

Open operational prerequisite: enable GitHub private vulnerability reporting
and native secret scanning when repository visibility becomes public.

## Secrets archaeology

- Current tracked-tree scan: no `.env`, private-key, keypair, credential, or
  secret file was tracked.
- Full-history object/path scan: no environment file, PEM/key container,
  keypair JSON, credential file, or `.secrets` path was found.
- Full-history signature scan: no GitHub, Slack, Stripe, private-key-header, or
  credentialed database URL signature was found.
- One disposable Devnet fee-payer key exists locally under `.secrets/`; Git
  confirms it is ignored. Its contents were not printed or copied.
- `audit:secrets` fails CI if a forbidden path or known high-signal token
  signature enters the tracked tree.

This is high-confidence negative evidence, not a mathematical proof that no
unknown secret format exists.

## Dependency and supply-chain evidence

- `pnpm audit --prod --json`: 78 production/optional dependencies queried; 0
  known vulnerabilities at all severities.
- OSV `/v1/querybatch` with ecosystem `crates.io`: 63 locked registry packages
  queried; 0 vulnerable packages returned.
- JavaScript manifests and Rust direct dependencies use exact versions; lock
  entries contain registry integrity hashes.
- GitHub Actions are pinned to immutable commit SHAs and run with
  `contents: read`; checkout persistence is disabled.
- CI installs npm packages with `--ignore-scripts`; no automatic dependency
  merge is configured.

`cargo-audit 0.22.2` could not compile under the pinned Windows GNU toolchain
because `dlltool.exe` was absent. No toolchain version was changed. The locked
crate graph was instead queried directly against the official OSV service,
which imports crates.io/Rust advisory data. CI still runs locked Rust tests.

## Attack-surface conclusions

- Collector: loopback-only, JSON content type, 256 KiB default body cap,
  request/header timeouts, runtime schema validation, observer allowlist,
  signature verification, idempotency, synchronous append, and replay checks.
- Hostile proxy: loopback-only, credential-free allowlisted loopback upstream,
  bounded request/response/concurrency/audit memory, upstream timeout, and no
  arbitrary forwarding.
- SDK: validates snapshot schemas and time bounds, rejects redirects, limits
  bytes/time, requires HTTPS except loopback, and fails open to local policy.
- Dashboard: static same-origin JSON only, React escaping, no HTML injection,
  no secrets, no forms, no auth, no database, no analytics, and no mutating API.
- Solana program: fixed-width instruction input, no accounts, only two accepted
  discriminators, and one equal-shape log operation.

## STRIDE residuals

- **Spoofing:** signatures authenticate the allowlisted observer key, not the
  truth or operational independence of its claims.
- **Tampering:** hashes and append-only logs expose byte changes; a compromised
  central collector can still suppress evidence.
- **Repudiation:** signatures and idempotent identifiers preserve origin, but
  there is no external timestamp or transparency anchor.
- **Information disclosure:** committed evidence exposes only classified public
  metadata; operator review remains necessary for every new fixture.
- **Denial of service:** local servers are bounded but not engineered for
  Internet exposure, distributed abuse, or high availability.
- **Elevation of privilege:** no privileged/public control plane exists; future
  hosted ingestion, tenants, and administration require a new threat model.

## Public-release blockers

None for source code plus the static fixture demo after the Sprint 12 gate
passes. Public collector/proxy/feed deployment remains blocked by TLS/client
authentication, production key custody, authorization, abuse controls,
multi-tenant isolation, retention/deletion operations, and independent
infrastructure validation.
