# Observer B common-runtime requalification — 2026-09-09

Status: `RUNTIME_REQUALIFIED` for the common runtime candidate only.

Google Observer B is requalified on reviewed runtime commit
`f4c70ea10198e5313eec0467f6a7b9222ff9e8f3`. This is not formal Milestone 1
acceptance, does not qualify Oracle Observer C on that commit, and does not
start Milestone 2.

## Independent soak verification

- The single retained run lasted from `2026-09-08T02:13:58.332Z` through
  `2026-09-09T02:13:58.468Z`, reaching 86,400 seconds of monotonic runtime.
- Independent local recomputation accepted all 1,440 sequential records and
  reproduced raw SHA-256
  `f38c85a42c780352cc44f324d3350603d7a667080589e1d60eaaa3808fc857fc`.
- Coverage was 0.9993060374739764, readiness was 1.0, identity mismatches were
  zero, and the maximum gap was 60,380 ms. The recomputed summary exactly
  matched the retained summary and reported no blockers.
- The systemd result was `success`. Raw and summary files remain mode `0600`
  on the host and in ignored operator artifacts. Raw JSONL is omitted from the
  public repository.

No soak was restarted or replaced during closure.

## Post-soak integrity and delivery boundary

The post-soak preflight passed all 14 checks: readiness and identity, clock,
key type/owner/mode, exact runtime commit, Node version, all 192 manifest files,
installed systemd unit, active/enabled observer service, loopback-only binding,
and disk threshold. Its SHA-256 is
`ae792ebca6c16dfb1476502d10a8cc4d7f65b5d7e5e3098ed5a79dfb6fb5ce6b`.

Readiness after closure reported five delivered results and queue zero. The
append-only delivery log also contained five accepted receipts, matching the
runtime count. The soak samples themselves do not contain delivery counters,
so no continuous delivery-count claim is made from those samples.

Before the soak, an isolated transport fixture proved degraded readiness, one
queued item, unchanged payload, automatic delivery, one matching Collector
acceptance, final queue zero, and restored readiness. It is transport evidence,
not a Solana observation or grant KPI unit.

## Signed Devnet integration

A fresh transaction and coordinator-signed assignment ran on the candidate
runtime before the soak. The seven-file public bundle at
`fixtures/grant-m1/observer-google-b-common-runtime-devnet-20260909` passes the
assignment signature, observer signature, raw-poll correlation, finalized
quorum, delivery receipt, Collector acceptance, and file-hash verifier.

It contains one real assignment-correlated Devnet observation with three
finalized reader claims. It is not a matched comparative grant unit and does
not prove operational independence of upstream RPC readers.

## Operational history and next gate

Two pre-soak worker starts stopped before transaction observation because the
new systemd templates and expected public configuration paths had not yet been
installed. The missing components were installed and verified before the
successful Devnet gate and before the soak began. An earlier upgrade helper
also rolled the runtime back when its final evidence-stat check lacked
permission; the corrected transactional upgrade then passed. None of these
setup attempts started, interrupted, or replaced the retained 24-hour run.

The next step is aggregate M1 acceptance review using the retained Observer C
qualification evidence. Observer C is not automatically updated or rerun. Any
additional qualification window requires a demonstrated unmet acceptance
requirement and a separate decision.
