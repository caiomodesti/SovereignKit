# M2 rehearsal execution checkpoint — 2026-09-12

Status: EXECUTION AND RAW RECONCILIATION COMPLETED; OTHER GATES PENDING.

The authorized pre-M2 rehearsal completed its real one-hour interval with the
exact aggregate ceiling of 12 Solana Devnet transactions. The final
continuation contributed nine unique transactions; all nine produced
assignment-bound `FINALIZED` worker evidence. The run recorded no fail-closed
event, left no worker instances loaded, contributed zero grant KPI units and
did not start the official fourteen-day window.

The raw-to-derived verifier recomputed all nine terminal outcomes from 15 raw
three-reader polls. It found nine unique units and signatures, equal observer
distribution, both frozen routes represented, and zero provenance or terminal
mismatches. This check is now a repeatable command rather than a manual count.

Across all controlled attempts, 12 unique Devnet submissions were acknowledged.
Eleven have complete `FINALIZED` worker evidence. The first acknowledged
transaction has no worker completion because its run failed closed during AWS
transport; it is retained as acknowledged-but-unobserved, never relabeled as a
finalized result. The write-once ledger validates exactly 12 unique signatures,
11 finalized results, one acknowledged-but-unobserved result and zero grant
units. Five chronological incidents are now preserved in the
append-only rehearsal incident log. Four are resolved; Telegram operator
receipt reconfirmation remains open.

The Google transport was changed from repeated `gcloud compute ssh/scp`
startup to direct non-interactive PuTTY transport with a pinned Ed25519 host
fingerprint. The full M2 preparation suite passed 87/87 before execution, and
all three hosts were upgraded atomically to source commit `65bd7e0`, with
versioned backups retained and no worker activation.

The Oracle portion of the signed rehearsal evidence was copied to the private
AWS backup destination. The 3,731-byte relay archive had SHA-256
`965c597b1171a8f7afe38c6c69c7303228a9edef03c26fa27fc3fbef3655121d`.
The AWS copy matched that hash, all 15 files extracted in the temporary restore
test, the retained destination copy remained in place, and the temporary
restore and relay copies were removed.

This checkpoint does not claim rehearsal acceptance or permission to start the
official window. Before a non-repeatable fourteen-day run is proposed, complete
live alert evaluation with operator receipt confirmation and current
resource/quota revalidation.
Starting the official window remains a separate explicit operator gate.

Sanitized machine-readable evidence is in
`fixtures/grant-m2/rehearsal-execution-20260912.json`. The ignored local
orchestrator journal is bound by its length and SHA-256 in that record.
