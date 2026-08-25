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

## Acceptance gate

The external acceptance command is intentionally impossible to pass without retained real evidence:

```powershell
node scripts/verify-grant-m1-acceptance.mjs --evidence <sanitized-m1-evidence-directory>
```

It requires at least three unique observer identities, providers, provider-account fingerprints, and sanitized instances; corroborated independence; matching allowlist identities; and existing signed-result, raw-observation, health, restart, provider, and failure-matrix evidence for every observer.

## Current validation record

- typecheck: PASS;
- deterministic tests: 92/92 PASS;
- Collector/Observer separate-process integration: PASS;
- grant software contract: PASS;
- retained local readiness harness: IMPLEMENTED; live run result recorded separately;
- dashboard production build: PASS;
- tracked-file secret audit: PASS;
- three-provider external acceptance: NOT RUN / evidence does not exist yet.

The canonical source checkout experienced a local pnpm-store/global-shim inconsistency after a sandboxed dependency reconstruction. To avoid altering versions, validation was also executed in a clean temporary checkout using the committed lockfile. This is an environment limitation, not external deployment evidence.
