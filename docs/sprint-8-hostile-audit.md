# Sprint 8 hostile audit

## Verdict

The dashboard is acceptable as a local evidence viewer. It is not a live
observatory, public infrastructure, production alerting system, or proof about
third-party providers.

## Attacks attempted

1. **Make stale data look current.** The snapshot has an explicit expiry and is
   rendered `STALE` at and after that instant.
2. **Fill gaps with plausible data.** Dataset validation rejects incomplete
   evidence; no generated sample or fallback measurement exists.
3. **Convert RPC acknowledgement into landing.** Failover copy explicitly says
   acknowledgement is not landing and names quorum confirmation separately.
4. **Hide the shared failure domain.** The overview displays the one-validator
   limitation before the detailed measurements.
5. **Call a single observer a network.** The dashboard shows exactly one
   allowlisted observer and its key identifier.
6. **Turn controlled behavior into an accusation.** Copy remains bounded to
   measured routes, controlled findings, and the experimental policy.
7. **Transform the scientific inputs.** The verifier compares cells and
   classifications with their source summaries byte-for-byte.
8. **Lose critical state on small screens.** Desktop, tablet, and mobile
   inspection found no document overflow; a mobile navigation defect was found
   and corrected before acceptance.

## Residual risks

- The dashboard is a static view of retained fixtures, not current telemetry.
- The single observer and three readers share local infrastructure.
- The dataset validator intentionally pins accepted controlled totals; a future
  multi-experiment dashboard needs a broader versioned index contract.
- Browser-side validation is a display-integrity guard, not cryptographic proof
  of a hosted artifact. Source verification occurs during the repository build.
- Public transaction signatures are linkable. This local viewer adds no user
  telemetry, but a hosted version will require an explicit privacy review.
- `ClassificationPolicyV0Experimental` remains uncalibrated and evidence is
  `LIMITED` at n=30 per eligible cell.
- System-font rendering varies by platform; the neutral brand is intentionally
  deferred and has no effect on evidence semantics.

## Scope audit

No automatic route mutation, hosted endpoint, public deployment, Devnet work,
observer geography claim, user analytics, billing, database, or Sprint 9 code
was added.
