# SovereignKit v0.1 Public Experimental Report

- Report version: `SovereignKitPublicExperimentalReport@0.1.0`
- Frozen at: `2026-08-14T22:26:54.474Z`
- Status: **controlled evidence published; production and provider claims remain gated**

## Executive finding

In a controlled local experiment, ClassificationPolicyV0Experimental reproducibly distinguished healthy operation, broad route degradation, class-selective asymmetry, and insufficient data. One separate Devnet transaction validated API and lifecycle integration only.

> This is a controlled experimental report, not a provider scorecard. It does not infer intent, censorship, or blame.

## What was tested

- Environment: local Agave 4.0.0 validator, project-owned matched program, controlled loopback proxies.
- Primary statistical unit: `experiment × observer × route × transaction_class × probe_index`.
- Declared classes: `MATCHED_CONTROL` and `PROGRAM_X`.
- Observation: 3 logical readers, quorum 2/3.
- Evidence: LIMITED at n=30 per eligible route/class cell; INSUFFICIENT at n=10.
- Signed units: 600; independently reverified observer signatures: 600.

Route identity policy: route-a, route-b, and route-c are synthetic logical submission perspectives in controlled infrastructure; they are not public provider identities or claims about physical paths.

## Controlled results

| Scenario | Logical route | Classification | Evidence strength | Control success | PROGRAM_X success | Absolute gap |
|---|---|---|---|---:|---:|---:|
| HEALTHY | route-a | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% |
| HEALTHY | route-b | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% |
| HEALTHY | route-c | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% |
| DEGRADED | route-a | DEGRADED | LIMITED | 20.0% | 20.0% | 0.0% |
| DEGRADED | route-b | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% |
| DEGRADED | route-c | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% |
| ASYMMETRIC | route-a | ASYMMETRIC | LIMITED | 100.0% | 0.0% | 100.0% |
| ASYMMETRIC | route-b | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% |
| ASYMMETRIC | route-c | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% |
| INSUFFICIENT_DATA | route-a | INSUFFICIENT_DATA | INSUFFICIENT | 100.0% | 100.0% | 0.0% |
| INSUFFICIENT_DATA | route-b | INSUFFICIENT_DATA | INSUFFICIENT | 100.0% | 100.0% | 0.0% |
| INSUFFICIENT_DATA | route-c | INSUFFICIENT_DATA | INSUFFICIENT | 100.0% | 100.0% | 0.0% |

The healthy phase kept all routes healthy. General degradation reduced both matched classes together and was classified `DEGRADED`, not `ASYMMETRIC`. Selective rejection reduced only `PROGRAM_X` on route-a and produced `ASYMMETRIC`. With ten units per class, the policy refused to classify and returned `INSUFFICIENT_DATA`.

All comparative units used distinct signatures. Pairing is methodological, never transaction identity. Scenario names and hostile-proxy schedules are not inputs to the classifier.

## Independent-observation limitation

three logical readers share one local validator; this is logical redundancy, not infrastructure independence. The 2/3 quorum proves logical separation between submission acknowledgment and observation decisions, but shared validator, host, clock, disk, RPC process, and network failure domains remain correlated.

## Devnet integration validation

A separate Devnet run completed `CREATED → SUBMISSION_ATTEMPTED → RPC_ACKNOWLEDGED → OBSERVATION_PENDING → OBSERVED_EXECUTION_SUCCESS → CONFIRMED → FINALIZED` for transaction [`2RzqePQSCvQL6Ve88sZR6uLMyNiKE7HukCN9aqroYgTud8LAWYzZX8XrnsEGdWt6BC78pQLWuufiyH7dzaAn5mvD`](https://explorer.solana.com/tx/2RzqePQSCvQL6Ve88sZR6uLMyNiKE7HukCN9aqroYgTud8LAWYzZX8XrnsEGdWt6BC78pQLWuufiyH7dzaAn5mvD?cluster=devnet).

The run observed 3/3 execution success, 3/3 confirmation, and 2/3 finalization claims. Operational independence was **not established by this test**. This is one integration run; not a rate estimate, controlled comparison, Mainnet proxy, or independent observer-network proof.

## Claim boundary

Supported:

- controlled measurements can distinguish broad degradation from class-selective behavior under the frozen experimental policy.
- RPC acknowledgment remains separate from ledger observation, confirmation, and finalization.
- unique structurally matched probes and explicit count-bounded windows can produce reproducible summaries.
- the current Solana client path completed one real acknowledged, observed, confirmed, and finalized Devnet transaction.

Not supported:

- provider intent, censorship, blame, or universal transaction accessibility.
- public provider ranking or a production scorecard.
- operational independence from three logical readers sharing infrastructure.
- Mainnet performance or general Devnet accessibility rates.
- a decentralized observer network or calibrated statistical confidence.

## Reproduce and verify

```powershell
corepack pnpm@11.16.0 install --frozen-lockfile
corepack pnpm verify:sprint-11
```

The command rebuilds the workspace, reruns all deterministic tests, verifies the accepted Sprint 5 and Sprint 10 fixtures, regenerates this report in memory, and compares Markdown, JSON, CSV, and the manifest byte for byte.

## Provenance inventory

| Source file | Bytes | SHA-256 |
|---|---:|---|
| `fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/derived/classifications.json` | 6327 | `8f97bd7c1e970d100af619dc970918e8aa45179d2a6930499fea77dc8f3c93a7` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/derived/execution-plan.json` | 60013 | `593510220f49d41dae6a78886fa9ae4554cf4d43d7d196723df6adbac6774c4d` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/derived/measurements.json` | 113094 | `0124e324db8f50727b1f84a56c617164413d099339e6d01ed1824e7eff8d7c81` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/experiment-definition.json` | 638 | `016c950e0de7ae1a5a55e1c6e7c8042d18a19984fdeff159a1085af24d76d75f` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/raw/probe-results.jsonl` | 455631 | `8fac8e3a21b693cabd7d9a2e7c02e29a7ae8a8522db47a2b8c0226ed48b7734e` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/raw/reader-claims.jsonl` | 123750 | `db1e0b3977b96eb15958f0c9c678b9863695d119a3af621c926634975da07f58` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/summary/experiment-summary.csv` | 675 | `acb6cfce925042916eb683dec2bf5c5a84d2e409e8ba3312216c68512a051cfd` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/summary/experiment-summary.json` | 6327 | `a2e085f06f9abb684b4ebb8b8e77173019e206b86ccb2f9f587c4f302df354eb` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/asymmetric/summary/experiment-summary.md` | 1508 | `7c96881192152793254972349ad6f51706c24adf38a299dcb389c1f4968321d5` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/degraded/derived/classifications.json` | 6313 | `33d67fc1955e43012f98c2137dcb83c9e5fd7e56ec28e4af5b18afc3bc7c17e7` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/degraded/derived/execution-plan.json` | 59941 | `f51cd82f7e172393b2d39c95958aea2615e203f4a67f2f66ac125996b607cb0b` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/degraded/derived/measurements.json` | 112616 | `d27bd753bd02f8e5f536263ff17771afeaef5fc6dc60783146d0eb4528c8db7a` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/degraded/experiment-definition.json` | 634 | `c3286d68c86c20413fbe7d9cf111e8b086145e8d9f42ab5ef5798ecf970c74d7` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/degraded/raw/probe-results.jsonl` | 453065 | `a9a76eb376c1a594fe942db41fe721dc22a745ad58c3648ebea9b49b82dcf4f9` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/degraded/raw/reader-claims.jsonl` | 120888 | `c5153806e3f18e10131245666eeed75afcc93d413c484853a866af87458da59a` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/degraded/summary/experiment-summary.csv` | 667 | `06b8b0ed59d1594e4f6af1b07b79c69beced052f9c4f00ece211eed5efb412cb` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/degraded/summary/experiment-summary.json` | 6313 | `db6af2b4c8b1e462390976bb77ff058e96d4d74f11073033959ae3ee28a42ea9` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/degraded/summary/experiment-summary.md` | 1497 | `336d62bc2223fd01bc96762309a78ab372189d7e4f4b1cff27dfb0730d531816` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/experiment-manifest.json` | 2555 | `f55254d53bc5b737f59f9d3cb1da25424b69885f7f66a4fc50a95ef7201a1bc5` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/healthy/derived/classifications.json` | 6284 | `052c4dab8a36f872714e46c1db2f33c71f3b5c5ff784e8d0833137d994610ccf` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/healthy/derived/execution-plan.json` | 60133 | `8652278b8f78935a449c39fa8a2d28c42f6c61648c3cd46e16266e3665ec9e0d` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/healthy/derived/measurements.json` | 112767 | `1d10da3f9b6a2339ca30411dae08a19f8fad761036f1a58f1356c031ea77e066` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/healthy/experiment-definition.json` | 632 | `14c75aafdc0519bd40bdafe1905c827be622c78fdd52445ab88f250eb1d3fe18` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/healthy/raw/probe-results.jsonl` | 455374 | `23224929c079dda7bfddc9bdbda88ad790b49745f69635171aaff1c3ccaa4e58` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/healthy/raw/reader-claims.jsonl` | 126360 | `97dfcae94c8e614758e59506c21be30a2c97b7b29ff863b982dd8aba4313d79f` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/healthy/summary/experiment-summary.csv` | 663 | `b679d73c3a033ebb0fb8dc5a03c2d04e84163050e8ff5ee9a375ee55d4b44816` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/healthy/summary/experiment-summary.json` | 6284 | `959ccc8f42d48bf598f4e52e72ff30e0c9f867795915f804166412858154e37d` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/healthy/summary/experiment-summary.md` | 1508 | `84b31f6b673944dab6c5f09b7a26779ef50ff5f485b184fd90df93b4f3a2cdc3` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/insufficient_data/derived/classifications.json` | 6011 | `5b821d13f8a15861ad9abac6f056e4d94925951b336bb8f67e0c922ab43ff97e` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/insufficient_data/derived/execution-plan.json` | 19973 | `0b30e95fff9081683946fa64c10122b1bffbfba01f40c3633358e6c3d7efaf41` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/insufficient_data/derived/measurements.json` | 38152 | `82401769750d974104741d2bf679abb08d4ed6cb19caaadb7cad6b0c3e409c8d` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/insufficient_data/experiment-definition.json` | 492 | `c48be7388eee1c20fb0d496cadf14e30845fa10a3da608ae68586b10f5dedf7a` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/insufficient_data/raw/probe-results.jsonl` | 153289 | `a03040c0fd7e70edbd98d123cebb31f9abd1d51da16f63d13f720876365ba7e2` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/insufficient_data/raw/reader-claims.jsonl` | 42840 | `464b898d6f21f2e67cc6bc5115d2005cd759460f5b5938cdf7d364a3f2fb6041` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/insufficient_data/summary/experiment-summary.csv` | 714 | `12a800a76c8ed55265602b68a7867b3d36ec4a25bfba8319b4bc91b67da9079a` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/insufficient_data/summary/experiment-summary.json` | 6011 | `cf4cded05b94f01baa6c1e12d360ba145dff575d8d63ce76911aef4f53bebf24` |
| `fixtures/integration/agave-4.0.0/controlled-experiment/insufficient_data/summary/experiment-summary.md` | 1564 | `e02a178f3ba9ce52779a40041460a9f3707befa9f28d606d71a006f5a4980ac2` |
| `fixtures/sprint-10/devnet-accepted-run-20260814T220116Z/cluster-metadata.json` | 297 | `0149a63420cd6e2d2da4255b648a373255230e9deae878d249b252d080b1239a` |
| `fixtures/sprint-10/devnet-accepted-run-20260814T220116Z/evidence.json` | 3054 | `34bd2c3147169b9426693fe81b329598ab6792bbbb0eb7e8d81b7b1107cf5ec5` |
| `fixtures/sprint-10/devnet-accepted-run-20260814T220116Z/raw-events.jsonl` | 29732 | `2a41ae4118844b10d5a2c3fa886b9b6794ef428d3f2b6eb32090f5c275cbada3` |
| `fixtures/sprint-10/devnet-accepted-run-20260814T220116Z/timeline.json` | 3275 | `df833fa21c15b8dc8b6d406ce7c6849638ad63ba2e4ecbdec1fd03d99aeb2fba` |
| `fixtures/sprint-10/devnet-accepted-run-20260814T220116Z/timeline.txt` | 411 | `6caef9087d8a861527124d949323b0122808ef648e3cb730deb8220a28c52ae0` |

The raw JSONL evidence remains the primary source of truth. This report and dashboard are derived views.
