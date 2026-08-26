# Grant Milestone 1 software reproduction

Status: local software evidence only; it does not accept the milestone.

## Pinned setup

```powershell
$env:CI='true'
corepack pnpm@11.16.0 install --frozen-lockfile
```

## Software gate

```powershell
corepack pnpm verify:grant:m1:software
```

The gate compiles the workspace, executes all deterministic tests, and verifies the required Milestone 1 contracts and deployment templates.

## Focused failure matrix

```powershell
node node_modules/vitest/vitest.mjs run packages/collector/src
```

The committed tests distinguish healthy finalization, execution failure, expiry, delayed convergence, one-reader loss with quorum, two-reader loss without quorum, disagreement, unknown observer, invalid signature, stale identity, malformed input, duplicate replay, and conflicting replay.

## Separate process proof

```powershell
corepack pnpm build
node node_modules/vitest/vitest.mjs run packages/collector/integration/process-separation.integration.test.ts --testTimeout=30000
```

This starts Observer and Collector as different OS processes, submits signed evidence, restarts the Collector, and verifies durable replay protection.

## Retained local readiness run

Start the pinned Agave validator in one terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-validator.ps1
```

Then execute the retained readiness proof in another terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-grant-m1-local-readiness.ps1
```

The command creates a new timestamped directory under
`artifacts/grant-m1/local-readiness/`, performs a real legacy System Program
transfer, observes it through three logical reader clients, derives a 2/3
terminal state, signs the ProbeResult with a temporary observer identity,
delivers it to the loopback Collector, captures health surfaces, reopens the
Collector log, and verifies that no observer private key entered the evidence
directory. The temporary signing key is deleted after the run.

This is a deployment-readiness rehearsal, not independent-observer evidence.
All three readers, the observer, and the Collector share one machine and one
local validator, so the verifier requires `infrastructure_independence: false`.

## Local recovery drill

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-grant-m1-recovery-drill.ps1
```

The drill first runs the Observer against an unavailable Collector and requires
the unsigned result to remain queued. It restarts the Observer, brings up the
Collector, requires one durable delivery, then restarts both processes and
requires exactly one reconstructed Collector record and zero duplicate delivery
records. The generated evidence is verified by
`scripts/verify-grant-m1-recovery-drill.mjs` and is explicitly scoped as
`LOCAL_SOFTWARE_RECOVERY_ONLY` with infrastructure independence set to false.

This drill must be repeated independently on all three real observer hosts. A
local pass cannot satisfy the external restart-evidence requirement.

## Real-host preflight command

After deploying the frozen commit on a Linux observer and starting its service,
run the versioned fail-closed capture documented in
`deploy/grant-pilot/README.md`. The command verifies the actual local systemd
service, `timedatectl` synchronization state, loopback `/ready` identity, Git
commit, Node.js version, and tracked-tree cleanliness, observer-key metadata
without reading key contents, and an explicit free-disk floor. Its output is
suitable for the observer's indexed `health_history` evidence.

The pure preflight contracts are exercised on every software gate. A unit-test
PASS is not host evidence, and the command intentionally fails on non-Linux
machines rather than fabricating a deployment result.

## Acceptance gate

The external acceptance command is intentionally impossible to pass without retained real evidence:

```powershell
node scripts/verify-grant-m1-acceptance.mjs --evidence <sanitized-m1-evidence-directory>
```

It requires at least three unique observer identities, providers, provider-account fingerprints, and sanitized instances; corroborated independence; matching allowlist identities; and existing signed-result, raw-observation, health, restart, provider, and failure-matrix evidence for every observer.

The external evidence index uses `GrantM1EvidenceIndex@0.3.0`. Every artifact
reference contains a relative observer-scoped path and a lowercase SHA-256.
Acceptance recomputes each hash, rejects empty or oversized files, searches for
private-key markers, cryptographically verifies signed assignments and
ProbeResults against their public allowlists, correlates raw polls to both, and
validates the minimum health, provider, restart, and failure-matrix content.
Placeholder files cannot satisfy the gate.

## Current validation record

- typecheck: PASS;
- deterministic tests: 93/93 PASS;
- assignment/evidence hostile contracts: 14/14 PASS;
- Collector/Observer separate-process integration: PASS;
- grant software contract: PASS;
- retained local readiness harness: PASS against Agave 4.0.0;
- real local transaction: `5e545kvHHdAVY633iegqQqV9A1p5p3DxXGhJLNwWdoTahpAqNoauTyt4vBqwZv4Mgf1rFzpc5T3WJ3rLoKMyemes`;
- retained raw polls: 280;
- public evidence anchor: `fixtures/grant-m1/local-readiness-20260825.json`;
- dashboard production build: PASS;
- tracked-file secret audit: PASS;
- three-provider external acceptance: NOT RUN / evidence does not exist yet.

The canonical source checkout experienced a local pnpm-store/global-shim inconsistency after a sandboxed dependency reconstruction. To avoid altering versions, validation was also executed in a clean temporary checkout using the committed lockfile. This is an environment limitation, not external deployment evidence.
