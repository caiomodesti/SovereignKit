# Grant M1 common Observer runtime candidate — 2026-09-06

Status: `LOCAL_PACKAGE_VALIDATED_NOT_DEPLOYED`

The common Observer package was built from reviewed `main` commit
`f4c70ea10198e5313eec0467f6a7b9222ff9e8f3` after the authenticated experiment
plan, conservative quorum, source-age, delivery-recovery, and signed-feed
changes were integrated.

Local packaging evidence:

- manifest schema: `GrantM1ObserverRuntimeManifest@0.1.0`;
- manifest entries: 192;
- manifest SHA-256:
  `5088e46578192885e58a30a52937478dfa6796b279b115eac7af56dad2eb697b`;
- every listed file hash independently recomputed: PASS;
- `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`: PASS;
- packaged Observer runtime and observation worker imports: PASS.

The package remains in the ignored local `artifacts/` directory. It contains no
host credentials and has not been copied to AWS, Google Cloud, or Oracle.
Therefore it does not requalify any host, does not justify a new soak by itself,
and does not establish Milestone 1 acceptance. Deployment requires a separate
review of whether the material runtime changes invalidate any retained host
gate; one host must be upgraded and qualified before the others are touched.

## Requalification decision

The change is material. Compared with the latest qualified AWS runtime, the
candidate changes the observation worker's quorum derivation and the delivery
runtime's retry/readiness behavior. The installed qualified commits are:

| Host | Qualified runtime |
| --- | --- |
| AWS Observer A | `883e01b726cbd8f71c884e7de74703f24364c3b0` |
| Google Observer B | `44031a66466e48fce5e1e93a86a7d48867edf134` |
| Oracle Observer C | `49557b234b7e359dcd77ca198639b6e0a936dee2` |

None equals the common candidate. Formal acceptance must therefore not combine
their old soak evidence with a claim that the new runtime is operating.

Requalification will be sequential:

1. upgrade only AWS Observer A to the exact candidate archive;
2. verify archive and all manifest hashes before service activation;
3. run frozen-runtime preflight, queue/outage recovery, service restart, and a
   signed Devnet assignment;
4. repeat the 86,400-second soak because readiness and delivery state semantics
   changed, then independently recompute it and rerun post-soak preflight;
5. only after AWS passes, repeat the same gates for Google B, then Oracle C.

The already retained historical evidence remains valid for its named commits;
it is not rewritten or discarded. The repeated gates qualify the common
candidate and are not counted as additional grant observations unless they are
real, signed, assignment-correlated Solana results.
