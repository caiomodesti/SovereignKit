# M2 official replacement-window procedure

Status: implemented but not authorized or activated.

The interrupted run `m2-official-20260914t163100000z` remains permanently
ineligible for acceptance. Its 487-file state tree and aggregate SHA-256
`6927da1cd611080dddf80feaee1973f4c58c339880f10ff9edccf12b3b02ec73`
must remain unchanged.

A replacement run uses an isolated path below
`/var/lib/sovereignkit/m2/official/replacements/<run-id>`. The systemd unit may
write there through its existing parent allowlist, while the old run remains
addressable at its original paths. The active coordinator configuration is
archived by content hash before it is replaced, and the replacement run and
preflight are installed without overwriting an existing run ID.

The replacement preparation requires, in this order:

1. a fresh immediate preflight at the corrected runtime commit;
2. the exact explicit 14-day authorization text after that preflight;
3. a run record bound to the interrupted run and incident;
4. at least three minutes of lead time and no more than fifteen minutes from
   preflight to scheduled start;
5. a stopped and disabled coordinator before armament;
6. a byte-stable interrupted state tree before and after replacement setup;
7. restart, single-writer and zero-worker proofs while waiting for start.

The operator helper chooses a start about eight minutes after authorization to
leave enough time for upload and armament while remaining inside the 15-minute
preflight validity window. Preparation alone does not start workers or the
official window.

Before the next immediate preflight, the Google e2-micro observer should receive
the bounded 2 GiB swapfile from
`scripts/enable-grant-m2-google-memory-resilience.sh`. It uses the already
allocated disk, requires at least 5 GiB free, preserves `/etc/fstab` by content
hash, and refuses to proceed if an official worker exists. This reduces OOM
risk on the 1 GiB host but does not relax the frozen 512 MiB available-memory
preflight floor.
