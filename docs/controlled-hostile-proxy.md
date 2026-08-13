# Controlled Hostile Proxy v0.1

## Purpose and scope

The proxy creates known local interventions for falsifiable transaction-accessibility experiments. It is not a general RPC gateway, censorship product, provider-testing tool, or semantic transaction classifier.

## Network boundary

- Binds only to literal `127.0.0.1` or `::1`.
- Forwards only to an exact allowlisted, credential-free, literal loopback HTTP URL.
- Rejects redirects.
- Accepts only `POST /`.
- Does not copy caller headers, cookies, authorization or endpoint credentials upstream.
- Enforces request bytes, streamed response bytes, concurrent requests, upstream timeout and audit-event capacity.
- Stops forwarding when audit capacity is exhausted rather than silently losing evidence.

These controls prevent open forwarding and use against third-party infrastructure. Remote deployment is outside v0.1.

## Immutable modes

Configuration is snapshotted at startup, including a copy of general-degradation nonce sets. Changing the caller's original objects cannot alter a running proxy.

- `PASS_THROUGH`: forwards every accepted request.
- `REJECT_CLASS(PROGRAM_X)`: rejects only controlled builder transactions whose discriminator is `0x01`.
- `GENERAL_DEGRADATION`: rejects both classes when their shared pair nonce belongs to the precommitted set.

Every mode requires a non-empty `scheduleId`. General schedules accept only 16-byte nonce encodings represented as 32 lowercase hex characters and have a 10,000-entry safety cap.

## Restricted classification

The classifier decodes base64 transaction bytes with the pinned Solana Kit codec and requires:

1. exactly one signer;
2. legacy transaction version;
3. exactly three instructions;
4. compute-budget program sequence `[set limit, set price]`;
5. exact controlled program address as the third program;
6. compute instruction data lengths/discriminators `5/0x02` and `9/0x03`;
7. no accounts on the controlled instruction;
8. controlled data length 17 bytes;
9. class discriminator exactly `0x00` or `0x01`.

Any decoding error, unknown program, version, shape or discriminator becomes `UNKNOWN` and passes through. Unknowns must later be excluded from controlled-class analysis; they cannot be selectively rejected.

## Audit evidence

Audit events contain version, UUID, sequence, timestamp, mode, schedule ID, JSON-RPC method, decision, classification, reason and SHA-256 of the pair nonce. They never store the raw transaction, signature or raw pair nonce. Events are frozen and exposed through copy snapshots. Audit hooks may additionally persist them; hook exceptions cannot alter the local trace.

Proxy audit and mode configuration are intervention-verification artifacts, not Asymmetry Engine inputs. Sprint 5 analysis must consume only measurements, definitions and policy; it must not read these proxy artifacts when producing classifications.

## JSON-RPC behavior

Controlled rejection returns HTTP 200 with JSON-RPC error code `-32098` and a generic message. The response intentionally omits class and schedule details. Payload/resource errors use bounded generic codes. Passing through is a forwarding decision, not proof that the upstream accepted or landed a transaction.
