# Data privacy and public-evidence policy v0.1

## Public dataset

The read-only demo may publish only committed, accepted fixtures. The current
dataset contains synthetic logical route labels, an ephemeral observer public
key, timestamps, hashes, public Solana addresses, a public Devnet transaction
signature, and the origin of Solana's public Devnet RPC. These are evidence and
public-chain identifiers, not application-user telemetry.

The demo contains no private keys, seed phrases, authenticated RPC URLs,
cookies, email addresses, IP addresses, analytics identifiers, or user-created
transaction payloads. It has no login, database, form submission, tracking
pixel, analytics SDK, or third-party runtime request. Its only outbound action
is a user-initiated link to Solana Explorer.

## Local-only material

- Disposable fee-payer and observer private keys remain ignored by Git.
- `.env*`, `.secrets/`, `*-keypair.json`, ledgers, artifacts, and temporary
  toolchains remain excluded from version control.
- Raw local runs may contain endpoint origins, transaction signatures, public
  addresses, and operator timestamps. Review is required before promotion to a
  committed fixture.

## Retention and deletion

Accepted fixtures are retained with the release because reproducibility
depends on immutable inputs. Unaccepted local artifacts and disposable keys are
operator-controlled and must not be uploaded. A future hosted collector needs
an explicit retention schedule, access control, deletion process, and privacy
review before accepting third-party data.

## Claim boundary

The current public evidence does not establish user behavior, provider intent,
physical route identity, observer independence, or Mainnet performance.

