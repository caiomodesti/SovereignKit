# Sprint 11 hostile methodology and publication audit

## Verdict

The public report is suitable for publishing the narrow accepted controlled
finding. It is not suitable for naming or ranking RPC providers, estimating
network-wide accessibility, or claiming independent observer infrastructure.

## Findings

### H1 — A polished report can make limited evidence look universal

**Severity: high, bounded.** The report leads with “controlled local
experiment,” repeats `LIMITED` evidence strength, and carries a supported versus
unsupported claims matrix. The Devnet result is isolated in its own section.

### H2 — Route labels can be mistaken for real provider identities

**Severity: high, bounded.** `route-a`, `route-b`, and `route-c` are explicitly
defined as synthetic logical perspectives. No controlled row contains a public
provider name. The Devnet endpoint is disclosed only as the public integration
route and is not comparatively classified.

### H3 — Source hashes establish integrity, not truth

**Severity: high, residual.** SHA-256 proves that readers have the same bytes;
it does not prove that the original runner, validator, proxy, observer, or host
was honest. Signed results authenticate the ephemeral observer key, not an
independent organization or trusted execution environment.

### H4 — Logical reader agreement is visually persuasive but correlated

**Severity: high, residual.** All local readers share one validator and host;
all Devnet readers use one endpoint origin. The report states that operational
independence was not established. Multi-operator, multi-region readers remain a
future validation requirement.

### H5 — Deterministic interventions are not organic failure prevalence

**Severity: high, residual.** The 0%, 20%, and 100% regimes prove separation
logic under declared controls. They do not calibrate false-positive rates,
temporal dependence, provider behavior, or how often similar events occur in
production.

### H6 — The publication timestamp is intentionally frozen

**Severity: low, accepted.** `generatedAt` identifies report version 0.1.0 and
is embedded in the deterministic generator. Re-running `--check` does not
pretend to republish the report at the current clock time. A later publication
requires a new report version and deliberate timestamp.

### H7 — Full raw fixture publication may expose unintended metadata

**Severity: medium, bounded for current dataset.** The source inventory was
reviewed for disposable/public addresses, logical labels, timestamps, and
public endpoint origins. No private key or authenticated endpoint secret is
claimed or expected. Sprint 12 must still run repository-wide secrets and
privacy archaeology before broader public release.

### H8 — A CSV row repeats route-level classification for both class cells

**Severity: low, documented.** Classification is a route/window conclusion;
cell measurements are route/class observations. Repeating the classification
keeps the CSV rectangular but must not be counted as two independent
classifications.

## Blockers

None for publishing report v0.1 with synthetic controlled route labels.

The following remain blockers for broader claims:

- operationally independent observers;
- repeated public-network sampling with declared windows;
- calibrated alert thresholds and organic false-positive estimates;
- identity, responsible-disclosure, right-of-response, and legal policies for
  named providers;
- production storage, authentication, availability, and abuse controls.

## Assumptions

1. Accepted Sprint 5 and Sprint 10 fixtures are immutable inputs.
2. SHA-256 remains adequate for artifact integrity identification.
3. Readers interpret `evidence_strength` as a methodological label, not
   posterior probability.
4. Public Devnet RPC identification is acceptable because no comparative or
   adverse classification is attached to it.
5. English is the primary public-report language for ecosystem reach.

## Residual risks

- Readers may quote a result without its limitations.
- Repository forks can alter evidence and retain branding.
- Explorer or Devnet history may later become unavailable.
- A deterministic report can still encode a deterministic methodological bug.
- Legal/reputational exposure rises sharply if future reports identify
  providers.
