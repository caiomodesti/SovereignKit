# SovereignKit commercial thesis v0.1

## Status

Working hypothesis for customer discovery. This document is not evidence of
product-market fit, revenue, willingness to pay, or production readiness.

## Problem

Solana applications often depend on multiple logical transaction-submission
routes but have weak evidence about what each route acknowledged, what later
reached the ledger, whether a failure was broad or workload-specific, and when
fallback actually restored confirmed execution. Generic uptime does not answer
these questions.

## Initial product position

SovereignKit should be positioned as **independent transaction-submission
observability and resilience infrastructure for Solana applications**.

It should not initially be positioned as a public blacklist, censorship oracle,
provider ranking site, or decentralized observer network. Controlled
classifications describe measurements under a declared experimental policy;
they do not establish provider intent.

## Candidate customers

1. Wallets that need reliable send/fallback behavior and incident evidence.
2. Trading and execution systems where route failure has measurable economic
   cost.
3. DeFi protocols and keepers operating redundant RPC/submission paths.
4. Custodians and enterprises that require audit trails and vendor oversight.
5. RPC providers seeking private regression detection and workload benchmarks.

## Product layers

- **Open-source SDK and local observability:** transaction lifecycle, bounded
  failover, controlled probes, local summaries, and transparent methodology.
- **Managed route intelligence:** versioned snapshots, freshness/TTL,
  multi-region history, alerts, comparisons, and API access.
- **Enterprise assurance:** private deployments, retention, SSO/RBAC, SLA,
  incident exports, integration support, and custom route profiles.
- **Private provider diagnostics:** reproducible controlled reports delivered
  before any responsible public disclosure.

## Revenue hypotheses to test

- usage- or route-based SaaS subscription for intelligence and alert history;
- team/enterprise plans for retention, access controls, SLA, and support;
- private benchmarking and incident-analysis engagements;
- provider-facing continuous regression monitoring.

No billing, token, incentive, or decentralized-observer mechanism belongs in
v0.1 merely to make the business story appear complete.

## Commercial and legal tension

Publishing named asymmetry claims can create reputational and legal risk and may
turn potential infrastructure partners into adversaries. The default product
should therefore be private, evidence-preserving, and remediation-oriented.
Any later public report needs identity policy, minimum evidence standards,
repeatability, right of response, responsible disclosure, and legal review.

Providers must never be able to pay to suppress or alter measurements. They may
pay for private tooling, retention, support, and diagnostics, but methodology
and classification provenance must remain auditable.

## Discovery plan before dashboard investment

Conduct at least 15 structured interviews:

- five wallets or consumer applications;
- five protocols, trading systems, keepers, or custodians;
- five RPC/infrastructure operators.

Test these questions:

1. How are submission-route failures detected today?
2. What was the cost and duration of the last meaningful incident?
3. Is confirmed failover evidence more valuable than endpoint uptime?
4. Who owns the budget: engineering, reliability, security, or vendor
   management?
5. Which deployment and retention requirements are mandatory?
6. Would the buyer pay for private intelligence, alerts, audit history, or SLA?
7. What provider-comparison language would be operationally useful and legally
   acceptable?

## Validation thresholds

Proceed with managed-product investment only if interviews produce:

- at least five credible recurring pain reports;
- at least three design partners willing to provide routes and incident data;
- at least two explicit budget or paid-pilot signals;
- a clear primary buyer and deployment model.

Otherwise keep SovereignKit as an open-source research and reliability tool and
revisit the commercial thesis before building a dashboard.

