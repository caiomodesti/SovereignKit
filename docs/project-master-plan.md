# SovereignKit project master plan

Status: official project alignment
Approved grant: Superteam Brazil / Solana Foundation Brazil Grants, USDG 1,500
Active stage: Grant Milestone 1 — Independent Observation Layer
Last updated: 2026-08-24

## North star

SovereignKit is independent transaction-submission observability and resilience infrastructure for Solana applications. It preserves the distinction between RPC acknowledgement, ledger observation, confirmation, and finalization; compares declared matched transaction classes across logical routes; and gives applications bounded, fail-open routing intelligence.

The project is not a censorship oracle, provider blacklist, universal transaction classifier, production SLA, or decentralized observer network. Every public conclusion must remain no stronger than the retained measurements and versioned policy support.

## Two-layer strategy

The public evidence layer remains open source and reproducible: SDK foundations, methodology, signed pilot dataset, verification tools, bounded reports, and a read-only observatory.

The later commercial assurance layer may sell delivery and operations: managed route intelligence, history, alerts, API access, private deployments, retention, SSO/RBAC, SLA, integration support, incident analysis, and private regression diagnostics. No customer may pay to suppress, alter, or selectively publish measurements or classifications.

## Stage sequence and gates

| Stage | Required outcome | Maximum defensible claim | Gate to continue |
|---|---|---|---|
| Accepted v0.1 baseline | Controlled proof, 600 signed units, four scenarios, Devnet integration proof | Methodology works in the bounded controlled and Devnet contexts | Frozen tag and regression gates |
| Grant Milestone 1 | 3+ real observers on distinct infrastructure providers | Operationally separated observers produced authentic signed evidence | External deployment and independence evidence; code alone is insufficient |
| Grant Milestone 2 | 14+ real days and 3,000+ qualifying signed observations | A bounded public pilot operated under a frozen design | Real time, complete inclusion rules, no unresolved integrity failure |
| Grant Milestone 3 | Public dataset, methodology, observatory, reproduction, final report | Third parties can verify the bounded pilot and its limitations | Requirement-to-evidence acceptance index and all release gates |
| Market validation | 15 structured interviews and explicit design-partner signals | A specific buyer and recurring operational pain are evidenced | 5 credible pain reports, 3 design partners, 2 budget or paid-pilot signals |
| Private managed beta | Route intelligence and alerts used by design partners | The product provides operational utility to named pilot users | Retention, reliability, privacy, legal, and willingness-to-pay evidence |
| Commercial availability | Managed API, support, controls, and defensible SLA | A supported reliability product exists | Security review, support model, unit economics, contracts, and production evidence |
| Ecosystem expansion | More observers, regions, integrations, and longer windows | Broader coverage, never universal truth | New evidence and customer/ecosystem demand |

## Current grant contract

The grant milestones and KPI in `grant-pilot-plan.md` are immutable delivery commitments:

- 3+ operationally independent observers across distinct providers;
- 14+ days of real operation;
- 3,000+ qualifying signed transaction-accessibility observations;
- public signed dataset and methodology;
- reproducible observatory and final technical report.

Milestones execute strictly in order. Each may use `NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED_NOT_VALIDATED`, or `ACCEPTED`. A milestone never becomes `ACCEPTED` merely because code, containers, or configuration exist.

## Explicit non-diversion rules

Until the current grant is accepted, the active milestone cannot be displaced by tokens, observer incentives, multichain support, generic semantic classification, aggressive provider rankings, billing, unrelated dashboard polish, or claims of decentralization. New ideas go to a post-grant backlog and cannot silently enter the funded scope.

Controlled, Devnet integration, and grant-pilot operational evidence stay separated. Provider intent, censorship, geographic independence, or universal Solana accessibility cannot be inferred from route measurements alone.

## Post-grant commercial validation

Candidate buyers are wallets, trading or execution systems, DeFi protocols and keepers, custodians and enterprises, and RPC providers seeking private regression diagnostics. Managed-product investment is authorized only after the validation thresholds in `commercial-thesis-v0.1.md` are met. Otherwise SovereignKit remains an open-source research and reliability tool while the commercial thesis is revised.

## Follow-on funding thesis

A later grant must fund net-new public-good outcomes rather than repeat this grant. A defensible follow-on could expand to 5–10 observers, more providers and regions, 60–90 day windows, calibrated evidence strength, collector-omission transparency, real SDK integrations, a stable public API, and additional public datasets. Eligibility and non-duplication must be confirmed with the grant operator before submission. Preparation may begin near the end of the pilot, but submission should rely on accepted evidence from the current grant.

## Governance

1. Only one grant milestone is active at a time.
2. Every acceptance requirement maps to retained evidence and a verification command.
3. Weekly updates state target, actual result, blockers, cost, evidence, and next action.
4. Secrets, wallet material, cloud credentials, and billing data never enter Git, chat, or public logs.
5. Operational claims require external operational evidence.
6. Methodology and qualification rules are frozen before the Milestone 2 window.
7. Missing data and failed runs remain visible; no cherry-picking or retroactive rule changes.
8. A future grant or commercial feature cannot weaken the v0.1 evidence invariants.

## Founder explanation

Short form: SovereignKit verifies whether Solana transactions actually traverse different submission routes. It does not trust an RPC acknowledgement as proof of landing: signed observers and explicit quorum preserve evidence through confirmation and finalization, enabling reproducible incident analysis and bounded failover.

Commercial form: the open evidence layer establishes an auditable methodology; managed customers may later pay for route-intelligence delivery, history, alerts, private deployments, SLA, and support—not for favorable conclusions.
