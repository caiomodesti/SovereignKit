# Grant Milestones 1–3: execution and cost plan

Status: public-offer research complete; account eligibility and host validation
required; no resource provisioned.

## What the grant actually requires

| Milestone | Required result | Work sequence | Target cash cost | Paid fallback |
|---|---|---|---:|---:|
| 1 — Independent Observation Layer | Three real observers on distinct infrastructure providers, signed evidence, health and failure/recovery proof | confirm benefits and scope; validate candidate hosts; deploy Collector; deploy one canary; deploy observers B and C; run acceptance | USD 0 | up to USD 50/month |
| 2 — Public Evidence Pilot | Accepted topology operating for 14 real days with at least 3,000 qualifying signed observations | freeze routes, cadence, schemas and exclusions; start immutable window; monitor daily; retain incidents and counts; close only after time and count gates | USD 0 incremental when credits/free tiers remain valid | continuation of M1 hosts, up to USD 50/month |
| 3 — Open Evidence Release | Public signed dataset, methodology, observatory, reproduction commands and final report | freeze dataset; checksum and verify; publish GitHub Release; update static dashboard; run security/privacy/link gates; publish acceptance index | USD 0 using current GitHub/static hosting | optional domain or storage only |

The reserve is not a planned expense. Set aside at most USD 100 so two billing
months can be covered if free infrastructure proves unreliable. Any actual
spend remains separately approved and recorded.

## What Superteam benefits can replace

### RPC routes

- Alchemy: application already submitted; advertised credits are valid for a
  90-day evaluation when awarded.
- GetBlock: Superteam advertises priority access to up to USD 10,000 in credits
  for 90 days.
- Carbium: Superteam advertises six months free; Carbium's public product is
  Solana RPC/data infrastructure rather than a general Linux VM service.
- Incoming partner: unknown until its terms, duration, network, rate limits,
  regions, and credit amount are announced.

These benefits make a zero-cost RPC route set realistic. They do not by
themselves run our observer daemon or establish operational independence.

### Observer compute

- AWS Lightsail: preferred first observer canary using the 2 GiB public-IPv4
  bundle when the account console confirms the current free-trial entitlement.
  The principal risk is automatic paid continuation after the trial.
- Google Cloud: third-party-independent observer candidate using one eligible
  `e2-micro`. It has 1 GiB memory, 30 GiB standard disk, and 1 GiB monthly
  external egress under the current Free Tier, so it must pass the same canary
  and retain usage measurements.
- Oracle Cloud: one 1-OCPU/6-GiB A1 observer plus one 1-OCPU/6-GiB Collector
  fit within the aggregate Always Free compute allowance. Capacity, ARM64
  compatibility, home-region placement, and idle reclamation remain blockers.
- OVHcloud: Superteam advertises up to 40% savings; this is a discounted paid
  fallback, not a zero-cost commitment.

No free-tier host is accepted until the same production-like preflight and
24-hour soak pass. A free label is not evidence of fitness.

The canonical candidate record and its fail-closed validator are
`deploy/grant-pilot/zero-cost-candidate-plan.json` and
`scripts/verify-grant-m1-zero-cost-plan.mjs`. Every component deliberately
retains `account_eligibility: UNVERIFIED`, `provisioned: false`, and
`admitted: false` until real console and host evidence exists.

## Possible unavoidable costs

- a small cloud overage if a free allocation expires or is exceeded;
- a domain only if no controlled free hostname is acceptable for TLS;
- Devnet has no transaction-fee purchase requirement; Mainnet transaction fees
  would require a small SOL balance only if the grant operator explicitly
  requires Mainnet for the pilot;
- taxes or temporary payment-card verification holds may exist even when usage
  is covered by credits.

Backups, paid monitoring, managed databases, paid dataset hosting, a dedicated
Solana validator, and paid RPC plans are not required by the approved milestones.

## Decisions under the approved contract

1. The pilot uses Solana Devnet unless a later grant amendment explicitly adds
   Mainnet. The approved milestones require multiple Solana transaction routes,
   not Mainnet spending.
2. Free-tier VMs count exactly like paid VMs only after real provider, account,
   region, instance, ASN, runtime, health, failure, and recovery evidence passes.
3. The incoming partnership is treated as RPC-only unless its published product
   demonstrably includes a Linux environment suitable for our runtime and key.
4. A controlled conventional DNS hostname is an implementation requirement for
   Collector HTTPS; the mechanism may be free or paid and does not change the
   milestone.

No external clarification is a prerequisite for continuing Milestone 1. The
paid topology remains a fallback while the active work qualifies zero-cost
hosts using the same evidence gates.
