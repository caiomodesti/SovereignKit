# Sprint 5 GO/KILL checkpoint record

## Current decision: HOLD (publication mechanics only)

The scientific and implementation gates below pass, but the checkpoint cannot
be signed as `GO` yet because its required Sprint 5 source commit does not
exist. The local Git commit operation was rejected by the Codex approval system
after its usage limit was reached. The current branch HEAD
`19546cdca98324a76dd24680f194cf9f35f9debf` predates Sprint 5 and therefore
cannot be misrepresented as the evidence source.

Do not begin Sprint 6, dashboard, or public infrastructure while this record is
`HOLD`. After the Sprint 5 tree is committed, replace this section with the new
source commit, repeat `pnpm verify:sprint-5`, confirm a clean worktree, and sign
the explicit `GO` or another decision.

## Review

- Date: 2026-08-12
- Reviewer: Codex hostile methodological review
- Branch: `codex/sprint-5-asymmetry-engine`
- Accepted live experiment run: `20260812T164539Z`
- Program proof: 10 matched pairs / 20 unique transactions / 510 CU each class
- Controlled experiment: 600 signed statistical units
- Evidence level: controlled and `LIMITED` at n=30; never calibrated confidence

## Mandatory gates

| Gate | Result | Evidence |
|---|---|---|
| Matched probes | PASS | 100% matching-valid included units; zero exclusions |
| Unique transactions | PASS | zero duplicate signatures; reuse causes hard failure |
| Independent observation | PASS with stated limitation | 2/3 logical readers; one shared local validator |
| Healthy scenario | PASS | A/B/C `HEALTHY` |
| General degradation | PASS | A `DEGRADED`; B/C `HEALTHY`; never asymmetric |
| Selective rejection | PASS | A `ASYMMETRIC`; B/C `HEALTHY` |
| Insufficient data | PASS | A/B/C `INSUFFICIENT_DATA` |
| Measurement provenance | PASS | byte regeneration consumes definitions and measurements only |
| Real failover | PASS | Sprint 4 route trace: rejected primary, acknowledged fallback, quorum confirmed |
| Reproducibility | PASS | 600 signatures and 12 summary files independently verified |
| Required source commit | **BLOCKED** | approval-system usage limit prevented local commit |

## Evidence hashes

| Artifact | SHA-256 |
|---|---|
| Matched-program evidence | `E12D9024B87408CAAA51917B124722934CCA467A696BE7FFD69490B7D5EA64ED` |
| Healthy summary JSON | `959CCC8F42D48BF598F4E52E72FF30E0C9F867795915F804166412858154E37D` |
| Degraded summary JSON | `DB6AF2B4C8B1E462390976BB77FF058E96D4D74F11073033959AE3EE28A42EA9` |
| Asymmetric summary JSON | `A2E085F06F9ABB684B4EBB8B8E77173019E206B86CCB2F9F587C4F302DF354EB` |
| Insufficient-data summary JSON | `CF4CDED05B94F01BAA6C1E12D360BA145DFF575D8D63CE76911AEF4F53BEBF24` |
| Project-owned SBF | `F51BD55B94EF6A32A7C1A8624A28C47268F09E81E424507E9E29372254316EC2` |
| Snapshotless Windows validator | `B316C23BB115299CC8A367F2813711E21E2147D091F0674314712FD3D5BA55AC` |

## Residual risks requiring explicit acceptance at GO

1. Logical readers share validator, host, disk, clock, and failure domain.
2. Policy thresholds are uncalibrated and controlled-only.
3. Windows validator disables snapshots under ADR-017; snapshot semantics are
   outside the proof.
4. Observer keys authenticate run payloads but do not attest honest code,
   geography, or durable identity.
5. Loopback controlled faults do not establish third-party provider behavior.

## Unblocking procedure

1. Create a source commit containing the complete Sprint 5 tree.
2. Run `corepack pnpm verify:sprint-5`, `corepack pnpm check`, and
   `corepack pnpm test` from that commit.
3. Record the source commit and GitHub URL here.
4. Confirm all mandatory gates still pass and explicitly replace `HOLD` with
   `GO`, `HOLD`, or `KILL/PIVOT`.

