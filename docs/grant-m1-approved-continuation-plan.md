# Approved continuation order

Approved by the project owner on 2026-09-06. This records scope and gates, not completion claims.

1. Validate the latest head of PR #57 in CI and merge only after all checks pass.
2. Close remaining audit points: telemetry/SDK semantics, source-evidence age, failure recovery, and authenticated evidence completeness. Reproduce defects before claiming fixes. Local/CI results do not substitute for deployed evidence.
3. Prepare one reviewed runtime version for the three observers. Define deployment impact and rollback before controlled updates; do not update servers during steps 1–2.
4. Execute only the real-host checks justified by the changes. Define acceptance criteria and retained artifacts before starting any repeat soak. Preserve earlier evidence and clearly scope what it proves.
5. Consolidate and verify M1: at least three operationally independent observers, signed identities, health and documented failure modes. Formal acceptance remains a separate checkpoint.

Only after formal M1 acceptance: M2 continuous operation for at least 14 days across multiple transaction routes, targeting 3,000+ signed observations as committed. M3 publishes the dataset, methodology, updated observatory, reproducible outputs and final report.

No milestone expansion, new purchases or new charges without notifying the owner. No secret disclosure. Do not start a soak merely because the preceding one has finished.

## Verified checkpoint

Step 1 completed: PR #57 merged as `184f29915868c2f2fc9010042736b384bc19bc98`, after all checks on head `4151f47d604a67f82731e66cb60a9bd22876a90d` passed.

Step 2 in progress. SDK inspection confirms source `observed_at` is retained, but temporal validation currently checks publication expiry and rejects future source times without imposing a maximum source age (`packages/sdk/src/intelligence.ts`, `validateTemporalAndIdentitySemantics`). Next experiment: republish an old summary in a new, unexpired snapshot and verify whether it can influence routing. Do not claim a runtime exploit test until executed. Define an explicit source-age policy before implementation; recheck at poll and routing time. No deployment authorized by this checkpoint.
