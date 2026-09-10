# M2 rehearsal operational decisions

Status: ACCEPTED_DESTINATIONS_CONFIGURED; transfer and rehearsal not authorized.

This proposal supplements `deploy/grant-pilot/m2-rehearsal-plan.json`.
The rehearsal remains one hour, two cycles and twelve units. The official
fourteen-day window requires a separate decision after rehearsal acceptance.

## Backup proposal

Use the existing AWS observer host as the approved destination for a separate
copy of the Oracle Collector export and the three observers' raw evidence.
Suggested destination: `/var/lib/sovereignkit/backups/m2-rehearsal/<run-id>/`.
The destination is created and verified with access restricted to the service
identity and storage above the frozen alert floor. Reusing the host avoids
proposing another VM; storage and transfer quotas still need account verification.

Before configuration, verify destination identity, available space, restricted
access and resource headroom for the existing observer. Capture complete JSONL
records with explicit snapshot boundaries. Retain assignments, signed results,
receipts, raw observations, ledger, incidents and the frozen contracts. Exclude
private keys, credentials, environment files and credential-bearing RPC URLs.

Use unique run directories with no overwrite or automatic deletion. Retrieve
the stored bytes into a separate restore directory, compare lengths and SHA-256
hashes against the source, and retain source/destination host evidence. Distinct
labels alone do not establish distinct storage. This copy shares a failure
domain with observer A and is not an independent fourth observer.

## Alert destination and responder

The private Telegram channel is selected and the primary operator is assigned.
The bot accepted one synthetic message and the operator confirmed receipt.
Credentials and the numeric chat identifier remain in private ignored
configuration. The sanitized, hash-bound evidence records dispatch and receipt
confirmation. The delivery adapter still needs deployment with the alert
evaluator on the live hosts before the rehearsal.

## Resource worksheet

| Quantity from frozen contracts | Rehearsal | Official window |
| --- | ---: | ---: |
| Duration | 1 hour | 336 hours |
| Cycles | 2 | 672 |
| Total planned units | 12 | 4,032 |
| Units per observer | 4 | 1,344 |
| Units per route | 6 | 2,016 |

Units are not RPC request counts. Measure requests by method, polling,
submission, retries and health checks; include provider billing weights where
applicable. Check remaining account quota and credit expiry before the rehearsal
and again before the official window. The historical cost plan is not a current
account balance or authorization to incur charges.

Measure archive bytes, transfer bytes, disk growth, CPU and memory during the
rehearsal. For a preliminary pilot estimate, multiply variable per-unit usage by
4,032 and separately add continuous service/health-check usage over 336 hours.
Use measured worst-case units and explicit headroom rather than claiming an
average is an upper bound. Include source data, backup, temporary restore space,
logs and existing disk usage. Fourteen retained cumulative daily snapshots would
store up to 7.5 times the final dataset size under uniform daily growth; choose
and measure the snapshot strategy before asserting storage sufficiency.

## Decisions needed to configure the rehearsal

- Transfer and byte-restore a bounded export through the AWS destination.
- Deploy the Telegram delivery adapter with the alert evaluator on live hosts.
- Verify actual account quotas under the approved zero-incremental-spend ceiling.

After these decisions, configure and verify the destinations, finish the
resource worksheet, and present the exact run manifest for rehearsal approval.
Keep the existing frozen JSON contracts and their hashes unchanged during this
proposal stage; record actual deployment evidence separately.
