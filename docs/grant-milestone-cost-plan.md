# Grant Milestones 1–3: execution and cost plan

Status: public-offer research complete; the Oracle Collector and its narrow
public-TLS edge are admitted; observer account eligibility and host validation
are still required.

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

- AWS Lightsail: preferred first observer canary using the USD 12/month 2 GiB
  public-IPv4 bundle only when the account console confirms current AWS Free
  Tier credits and their expiration. AWS documents that the older Lightsail
  short-term trials were replaced for new customers by the credit model. The
  principal risks are account ineligibility and paid continuation after credits.
- Google Cloud: third-party-independent observer candidate using one eligible
  `e2-micro`. It has 1 GiB memory, 30 GiB standard disk, and 1 GiB monthly
  external egress under the current Free Tier, so it must pass the same canary
  and retain usage measurements.
- Oracle Cloud: one 1-OCPU/6-GiB A1 observer plus one 1-OCPU/6-GiB Collector
  fit within the aggregate Always Free compute allowance. Capacity, ARM64
  compatibility, home-region placement, and idle reclamation remain blockers.
- Oracle live result on 2026-08-28: the preferred A1 shape was unavailable in
  São Paulo AD-1. An Always Free-eligible E2 micro with 1 GiB memory was created
  only as the Collector canary. This does not change the observer topology and
  is not accepted until its stricter host/recovery/24-hour gates pass.
- If A1 capacity remains unavailable after the Collector canary, Oracle's
  documented allowance of up to two E2 micro instances makes a second micro a
  possible Observer C candidate. It would still have to pass the observer's
  host and 24-hour gates, and it may not be provisioned before Observer A. This
  contingency preserves three observer providers (AWS, Google, Oracle) but
  does not remove the Oracle control-plane coupling with the Collector.
- OVHcloud: Superteam advertises up to 40% savings; this is a discounted paid
  fallback, not a zero-cost commitment.

### Other relevant current Superteam benefits

- Quantstamp, Ackee, Adevar Labs, Hacken, Cantina, Zellic, FYEO, and Sec3 can
  reduce later security-review cost. They do not replace the repository's own
  Milestone 1 hostile tests.
- Allium and Nansen API credits may corroborate or enrich later public evidence,
  but third-party indexed data cannot become the sole transaction-observation
  truth source.
- Circulox, NeosLegal, and the listed legal-service benefits are commercial and
  legal support options for the public release; they are not required to run
  the pilot.
- The `.superteam` domain perk is not assumed to provide conventional DNS and
  publicly trusted TLS. It cannot satisfy the Collector hostname gate without
  a separately verified HTTPS mechanism.
- Project Advisory and Superteam Fast Track are useful for external review and
  distribution after technical evidence exists; they do not change milestone
  acceptance.

This inventory was rechecked against the public member-perks page on
2026-08-28. Terms remain mutable and are revalidated only when a benefit is
actually activated.

No free-tier host is accepted until the same production-like preflight and
24-hour soak pass. A free label is not evidence of fitness.

The canonical candidate record and its fail-closed validator are
`deploy/grant-pilot/zero-cost-candidate-plan.json` and
`scripts/verify-grant-m1-zero-cost-plan.mjs`. Every component deliberately
retains `account_eligibility: UNVERIFIED`, `provisioned: false`, and
`admitted: false` until real console and host evidence exists.

## Possible unavoidable costs

- a small cloud overage if a free allocation expires or is exceeded;
- the controlled domain was purchased for USD 7.98; the displayed current
  renewal is USD 11.84/year and must be reviewed before renewal;
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
