# Observer Identities v0.1

Observers use dedicated Ed25519 identities exclusively for measurement signing. These identities are not payer wallets and must never hold funds.

## Public identity record

```text
observer_id
key_id
public_key
valid_from
valid_until?
```

Raw Telemetry Core events already carry `observerId` and `keyId`. ProbeResult signing is implemented in a later sprint; Sprint 1 does not invent a PKI.

## Private key handling

- Never hardcode or commit private keys.
- Local development files live under `.secrets/`, which is ignored by Git.
- Use one distinct key for each observer identity.
- Future deployments use their environment's secret provider.
- Payer keys and observer-signing keys are separate by invariant.

Expected local layout, not committed:

```text
.secrets/
├── observer-br.json
├── observer-us.json
└── observer-eu.json
```

## Rotation semantics

The allowlist may contain multiple non-overlapping keys for one `observer_id`. Verification selects `key_id`, checks the public key and validity interval, and then verifies the canonical payload signature. Revocation and remote key management are deferred; this is central allowlist administration, not decentralized identity.
