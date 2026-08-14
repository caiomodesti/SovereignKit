# Sprint 7 reproduction

Install from the pinned lockfile:

```powershell
corepack pnpm install --frozen-lockfile
```

Run the complete verifier:

```powershell
corepack pnpm verify:sprint-7
```

It builds the entire workspace, runs all tests, reads the retained Sprint 5 asymmetric summary and its 180 signed ProbeResults, derives the last real observer time, regenerates the Sprint 7 evidence, applies the first fresh snapshot, and confirms that one version does not cross the two-snapshot avoid threshold.

Expected final line:

```json
{"reproduced":true,"version":1,"entries":6,"sourceObservedAt":"2026-08-12T16:50:54.093Z","inputHash":"66887c6f614f719fd09ce2c884630adb1a014ce69a1eda93910219fb908df7c1","firstPoll":"APPLIED","dispositionAfterOneSnapshot":"LOCAL_PRIMARY_FALLBACK"}
```

Run coverage separately:

```powershell
corepack pnpm test:coverage
```
