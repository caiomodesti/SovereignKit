# ADR-016: Windows source-build exception for Agave 4.0.0

- Status: Accepted
- Date: 2026-08-11
- Scope: Sprint 1.5 only

## Context

Sprint 1.5 requires a real local Agave validator while preserving Rust `1.97.1` and Agave `4.0.0` exactly.

The official Agave `4.0.0` Windows binary starts `solana-test-validator` but fails while reopening the generated genesis archive. In the official `v4.0.0` source, `snapshots/src/hardened_unpack.rs` creates and validates the destination directory and then calls `File::open(parent)`. Windows does not open a directory through the ordinary file semantics used by `File::open`; a directory handle requires `FILE_FLAG_BACKUP_SEMANTICS`.

The unmodified source file used for diagnosis has SHA-256:

```text
D5BC0F1B596641CDBD0FC9ED81A0A93CA51FEC869250275764271AEEEB01397C
```

The Linux fallback was also exhausted without changing Agave: WSL `2.7.11.0`, a verified Canonical Ubuntu 24.04 rootfs, an enabled `VirtualMachinePlatform`, repaired Windows component files, and an active hypervisor consistently fail when Hyper-V attaches the WSL system disk. The raw Hyper-V event is `Worker/Admin 12010`, device `Microsoft Flexible IO Device`, instance `C4B741F5-5582-4C98-8F8B-2E082933C396`, error `0x80070003`. Both OneDrive and local import paths produce the same failure.

## Decision

Build only the required Agave `v4.0.0` Windows binaries from the official release source using Rust `1.97.1`, with one OS-gated compatibility patch:

- on Windows, open the already-created and canonicalized parent directory with `std::os::windows::fs::OpenOptionsExt` and `FILE_FLAG_BACKUP_SEMANTICS`;
- on non-Windows targets, retain `File::open(parent)` unchanged;
- do not change archive path validation, permissions, entry limits, genesis contents, validator behavior, version metadata, or any dependency version.

This is a source-build provenance exception, not an Agave version upgrade. Resulting binaries must continue to report `4.0.0` and must never be represented as byte-identical to Anza's official Windows artifact.

## Required evidence

Before the patched binary may be used for Sprint 1.5:

1. preserve the pristine source archive/hash and a standalone patch file;
2. record the exact upstream release URL and archive SHA-256;
3. record the patched source-file SHA-256 and complete diff;
4. run the focused hardened-unpack tests on Windows;
5. build with Rust `1.97.1` and record the exact command and binary hashes;
6. verify every used CLI reports Agave/Solana `4.0.0`;
7. prove an unmodified archive is unpacked inside the intended destination and traversal protections still pass;
8. run the real-validator Sprint 1.5 proof and preserve raw evidence separately from build evidence.

If any condition fails, this ADR is not satisfied and the experiment remains blocked.

## Alternatives considered

- **Change Agave version:** rejected; violates the pinned Sprint 1.5 contract.
- **Continue repairing WSL/Hyper-V:** rejected for this sprint after reproducible HCS disk-attachment failure; further host mutation is disproportionate.
- **Enable full Hyper-V or unrelated optional features:** rejected; unsupported trial-and-error expansion.
- **Patch or hex-edit the official binary:** rejected; not reviewable or reproducible.
- **Use devnet or a remote validator:** rejected; changes the controlled local-validator experiment.

## Consequences

The proof can remain on Agave `4.0.0`, but its validator binary will have explicit local-build provenance. The patch and build become part of the experimental evidence and residual-risk analysis. This exception is limited to Sprint 1.5 and does not authorize product features or Sprint 2.

## Rollback

Delete the locally built binaries and use the untouched official Agave `4.0.0` artifact when upstream or the host environment provides a working implementation. The pristine source and official binary remain unmodified.
