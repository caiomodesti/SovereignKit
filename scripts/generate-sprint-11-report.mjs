import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const REPORT_VERSION = "SovereignKitPublicExperimentalReport@0.1.0";
const REPORT_GENERATED_AT = "2026-08-14T22:26:54.474Z";
const CONTROLLED_ROOT = resolve("fixtures/integration/agave-4.0.0/controlled-experiment");
const DEVNET_ROOT = resolve("fixtures/sprint-10/devnet-accepted-run-20260814T220116Z");
const OUTPUT_ROOT = resolve("reports/public-experimental-report-v0.1");
const PHASES = ["healthy", "degraded", "asymmetric", "insufficient_data"];
const OUTPUTS = {
  markdown: resolve(OUTPUT_ROOT, "report.md"),
  json: resolve(OUTPUT_ROOT, "report.json"),
  csv: resolve(OUTPUT_ROOT, "report.csv"),
  manifest: resolve(OUTPUT_ROOT, "manifest.json"),
};

const mode = process.argv[2] ?? "--check";
if (!new Set(["--write", "--check"]).has(mode)) {
  throw new Error("usage: node scripts/generate-sprint-11-report.mjs [--write|--check]");
}

const controlledManifest = await readJson(resolve(CONTROLLED_ROOT, "experiment-manifest.json"));
const devnetEvidence = await readJson(resolve(DEVNET_ROOT, "evidence.json"));
const summaries = {};
for (const phase of PHASES) {
  summaries[phase] = await readJson(resolve(CONTROLLED_ROOT, phase, "summary/experiment-summary.json"));
}

validateAcceptedInputs(controlledManifest, summaries, devnetEvidence);

const sourceFiles = [
  ...(await listFiles(CONTROLLED_ROOT)),
  ...(await listFiles(DEVNET_ROOT)),
].sort((left, right) => left.localeCompare(right));
const sources = await Promise.all(sourceFiles.map(fileMetadata));
const report = buildReport(controlledManifest, summaries, devnetEvidence, sources);
const rendered = {
  markdown: renderMarkdown(report),
  json: `${canonicalJson(report)}\n`,
  csv: renderCsv(report),
};
const manifest = {
  schemaVersion: "PublicReportManifest@0.1.0",
  reportVersion: REPORT_VERSION,
  generatedAt: REPORT_GENERATED_AT,
  generator: "scripts/generate-sprint-11-report.mjs",
  reproducibilityCommand: "corepack pnpm verify:sprint-11",
  sourceFiles: sources,
  outputs: Object.entries(rendered).map(([format, content]) => ({
    format,
    path: toPosix(relative(resolve("."), OUTPUTS[format])),
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  })),
};
const manifestText = `${canonicalJson(manifest)}\n`;

if (mode === "--write") {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await Promise.all([
    writeFile(OUTPUTS.markdown, rendered.markdown, "utf8"),
    writeFile(OUTPUTS.json, rendered.json, "utf8"),
    writeFile(OUTPUTS.csv, rendered.csv, "utf8"),
    writeFile(OUTPUTS.manifest, manifestText, "utf8"),
  ]);
  console.log(`wrote ${toPosix(relative(resolve("."), OUTPUT_ROOT))}`);
} else {
  await assertExact(OUTPUTS.markdown, rendered.markdown);
  await assertExact(OUTPUTS.json, rendered.json);
  await assertExact(OUTPUTS.csv, rendered.csv);
  await assertExact(OUTPUTS.manifest, manifestText);
  console.log(`Sprint 11 report is byte-reproducible (${sources.length} source files, ${report.controlledExperiment.signedStatisticalUnits} signed units)`);
}

function validateAcceptedInputs(manifest, phaseSummaries, devnet) {
  if (manifest.evidenceVersion !== "sprint-5-live-controlled-experiment@0.1.0") {
    throw new Error(`unexpected controlled evidence version: ${manifest.evidenceVersion}`);
  }
  let signedCount = 0;
  for (const phase of PHASES) {
    const summary = phaseSummaries[phase];
    const scenario = manifest.scenarios[phase];
    if (!scenario) throw new Error(`missing manifest scenario: ${phase}`);
    if (summary.policyVersion !== "ClassificationPolicyV0Experimental") {
      throw new Error(`${phase} uses unexpected policy ${summary.policyVersion}`);
    }
    if (summary.inputHash !== scenario.inputHash) throw new Error(`${phase} input hash mismatch`);
    if (summary.duplicateSignatures.length !== 0) throw new Error(`${phase} contains duplicate signatures`);
    if (summary.invalidUnitIds.length !== 0) throw new Error(`${phase} contains invalid units`);
    const actual = summary.classifications.map(value => value.classification);
    if (JSON.stringify(actual) !== JSON.stringify(scenario.expected)) {
      throw new Error(`${phase} accepted classification mismatch: ${actual.join(",")}`);
    }
    signedCount += scenario.signedResultCount;
  }
  if (signedCount !== 600) throw new Error(`expected 600 signed units, received ${signedCount}`);
  if (devnet.evidenceVersion !== "sprint-10-devnet-validation@0.1.0") {
    throw new Error(`unexpected Devnet evidence version: ${devnet.evidenceVersion}`);
  }
  const expectedLifecycle = [
    "CREATED",
    "SUBMISSION_ATTEMPTED",
    "RPC_ACKNOWLEDGED",
    "OBSERVATION_PENDING",
    "OBSERVED_EXECUTION_SUCCESS",
    "CONFIRMED",
    "FINALIZED",
  ];
  if (JSON.stringify(devnet.lifecycle) !== JSON.stringify(expectedLifecycle)) {
    throw new Error("accepted Devnet lifecycle changed");
  }
  if (devnet.observationQuorum.operationalIndependence !== "not established by this test") {
    throw new Error("Devnet operational-independence limitation is missing");
  }
}

function buildReport(manifest, phaseSummaries, devnet, sourceMetadata) {
  const scenarios = PHASES.map(phase => {
    const summary = phaseSummaries[phase];
    const scenario = manifest.scenarios[phase];
    return {
      scenario: phase.toUpperCase(),
      inputHash: summary.inputHash,
      probeIndicesPerClass: summary.definition.probeIndices.length,
      signedStatisticalUnits: scenario.signedResultCount,
      acknowledged: scenario.acknowledgedCount,
      rejected: scenario.rejectedCount,
      classifications: summary.classifications.map(value => ({
        routeId: value.routeId,
        classification: value.classification,
        evidenceStrength: value.evidenceStrength,
        controlSuccessRate: value.controlSuccessRate,
        programXSuccessRate: value.testSuccessRate,
        absoluteClassGap: value.absoluteClassGap,
        peerProgramXSuccessRate: value.peerTestBaseline.successRate,
      })),
      cells: summary.cells.map(value => ({
        routeId: value.routeId,
        transactionClass: value.transactionClass,
        expectedCount: value.expectedCount,
        completeCount: value.completeCount,
        missingCount: value.missingCount,
        invalidExclusionCount: value.invalidExclusionCount,
        successCount: value.successCount,
        inconclusiveCount: value.inconclusiveCount,
        policySuccessRate: value.successRate,
        completeCaseSuccessRate: value.completeCaseSuccessRate,
        wilson95: value.wilson95,
      })),
    };
  });
  return {
    schemaVersion: REPORT_VERSION,
    generatedAt: REPORT_GENERATED_AT,
    title: "SovereignKit v0.1 Public Experimental Report",
    status: "controlled evidence published; production and provider claims remain gated",
    executiveFinding: "In a controlled local experiment, ClassificationPolicyV0Experimental reproducibly distinguished healthy operation, broad route degradation, class-selective asymmetry, and insufficient data. One separate Devnet transaction validated API and lifecycle integration only.",
    controlledExperiment: {
      environment: "local Agave 4.0.0 validator, project-owned matched program, controlled loopback proxies",
      experimentId: phaseSummaries.healthy.definition.experimentId,
      experimentVersion: phaseSummaries.healthy.definition.experimentVersion,
      policy: "ClassificationPolicyV0Experimental",
      evidenceStrength: "LIMITED at n=30 per eligible route/class cell; INSUFFICIENT at n=10",
      statisticalUnit: "experiment × observer × route × transaction_class × probe_index",
      transactionClasses: ["MATCHED_CONTROL", "PROGRAM_X"],
      routeIdentityPolicy: "route-a, route-b, and route-c are synthetic logical submission perspectives in controlled infrastructure; they are not public provider identities or claims about physical paths",
      observation: {
        logicalReaders: 3,
        quorum: 2,
        limitation: manifest.observationLimitation,
      },
      signedStatisticalUnits: scenarios.reduce((total, value) => total + value.signedStatisticalUnits, 0),
      observerSignaturesVerified: scenarios.reduce((total, value) => total + value.signedStatisticalUnits, 0),
      uniqueSignatureRequirement: "every route × transaction_class × probe_index unit has its own signed transaction",
      scenarios,
    },
    devnetIntegration: {
      scope: devnet.scope,
      generatedAt: devnet.generatedAt,
      clusterGenesisHash: devnet.cluster.genesisHash,
      solanaCoreVersion: devnet.cluster.version["solana-core"],
      route: {
        routeId: devnet.route.routeId,
        logicalEndpointOrigin: devnet.route.logicalEndpointOrigin,
        transport: devnet.route.transport,
        observerRegion: devnet.route.observerRegion,
        configurationProfile: devnet.route.configurationProfile,
        providerLabel: devnet.route.providerLabel,
      },
      transactionSignature: devnet.transactionSignature,
      lifecycle: devnet.lifecycle,
      quorum: {
        required: devnet.quorum.required,
        observedSuccessReaders: devnet.quorum.observedSuccessReaderIds.length,
        confirmedReaders: devnet.quorum.confirmedReaderIds.length,
        finalizedReaders: devnet.quorum.finalizedReaderIds.length,
        operationalIndependence: devnet.observationQuorum.operationalIndependence,
      },
      recipientFinalizedBalanceLamports: devnet.recipientFinalizedBalanceLamports,
      claimBoundary: "one integration run; not a rate estimate, controlled comparison, Mainnet proxy, or independent observer-network proof",
    },
    claims: {
      supported: [
        "controlled measurements can distinguish broad degradation from class-selective behavior under the frozen experimental policy",
        "RPC acknowledgment remains separate from ledger observation, confirmation, and finalization",
        "unique structurally matched probes and explicit count-bounded windows can produce reproducible summaries",
        "the current Solana client path completed one real acknowledged, observed, confirmed, and finalized Devnet transaction",
      ],
      unsupported: [
        "provider intent, censorship, blame, or universal transaction accessibility",
        "public provider ranking or a production scorecard",
        "operational independence from three logical readers sharing infrastructure",
        "Mainnet performance or general Devnet accessibility rates",
        "a decentralized observer network or calibrated statistical confidence",
      ],
    },
    provenance: {
      sourceOfTruth: "committed raw and derived accepted fixtures; this report is a downstream deterministic view",
      controlledEvidenceVersion: manifest.evidenceVersion,
      controlledEvidenceGeneratedAt: manifest.generatedAt,
      devnetEvidenceVersion: devnet.evidenceVersion,
      sourceFiles: sourceMetadata,
    },
  };
}

function renderMarkdown(report) {
  const scenarioRows = report.controlledExperiment.scenarios.flatMap(scenario =>
    scenario.classifications.map(value => `| ${scenario.scenario} | ${value.routeId} | ${value.classification} | ${value.evidenceStrength} | ${percent(value.controlSuccessRate)} | ${percent(value.programXSuccessRate)} | ${percent(value.absoluteClassGap)} |`),
  );
  const sourceRows = report.provenance.sourceFiles.map(value => `| \`${value.path}\` | ${value.bytes} | \`${value.sha256}\` |`);
  return [
    "# SovereignKit v0.1 Public Experimental Report",
    "",
    `- Report version: \`${report.schemaVersion}\``,
    `- Frozen at: \`${report.generatedAt}\``,
    `- Status: **${report.status}**`,
    "",
    "## Executive finding",
    "",
    report.executiveFinding,
    "",
    "> This is a controlled experimental report, not a provider scorecard. It does not infer intent, censorship, or blame.",
    "",
    "## What was tested",
    "",
    `- Environment: ${report.controlledExperiment.environment}.`,
    `- Primary statistical unit: \`${report.controlledExperiment.statisticalUnit}\`.`,
    `- Declared classes: \`${report.controlledExperiment.transactionClasses.join("` and `")}\`.`,
    `- Observation: ${report.controlledExperiment.observation.logicalReaders} logical readers, quorum ${report.controlledExperiment.observation.quorum}/${report.controlledExperiment.observation.logicalReaders}.`,
    `- Evidence: ${report.controlledExperiment.evidenceStrength}.`,
    `- Signed units: ${report.controlledExperiment.signedStatisticalUnits}; independently reverified observer signatures: ${report.controlledExperiment.observerSignaturesVerified}.`,
    "",
    `Route identity policy: ${report.controlledExperiment.routeIdentityPolicy}.`,
    "",
    "## Controlled results",
    "",
    "| Scenario | Logical route | Classification | Evidence strength | Control success | PROGRAM_X success | Absolute gap |",
    "|---|---|---|---|---:|---:|---:|",
    ...scenarioRows,
    "",
    "The healthy phase kept all routes healthy. General degradation reduced both matched classes together and was classified `DEGRADED`, not `ASYMMETRIC`. Selective rejection reduced only `PROGRAM_X` on route-a and produced `ASYMMETRIC`. With ten units per class, the policy refused to classify and returned `INSUFFICIENT_DATA`.",
    "",
    "All comparative units used distinct signatures. Pairing is methodological, never transaction identity. Scenario names and hostile-proxy schedules are not inputs to the classifier.",
    "",
    "## Independent-observation limitation",
    "",
    `${report.controlledExperiment.observation.limitation}. The 2/3 quorum proves logical separation between submission acknowledgment and observation decisions, but shared validator, host, clock, disk, RPC process, and network failure domains remain correlated.`,
    "",
    "## Devnet integration validation",
    "",
    `A separate Devnet run completed \`${report.devnetIntegration.lifecycle.join(" → ")}\` for transaction [\`${report.devnetIntegration.transactionSignature}\`](https://explorer.solana.com/tx/${report.devnetIntegration.transactionSignature}?cluster=devnet).`,
    "",
    `The run observed ${report.devnetIntegration.quorum.observedSuccessReaders}/3 execution success, ${report.devnetIntegration.quorum.confirmedReaders}/3 confirmation, and ${report.devnetIntegration.quorum.finalizedReaders}/3 finalization claims. Operational independence was **${report.devnetIntegration.quorum.operationalIndependence}**. This is ${report.devnetIntegration.claimBoundary}.`,
    "",
    "## Claim boundary",
    "",
    "Supported:",
    "",
    ...report.claims.supported.map(value => `- ${value}.`),
    "",
    "Not supported:",
    "",
    ...report.claims.unsupported.map(value => `- ${value}.`),
    "",
    "## Reproduce and verify",
    "",
    "```powershell",
    "corepack pnpm@11.16.0 install --frozen-lockfile",
    "corepack pnpm verify:sprint-11",
    "```",
    "",
    "The command rebuilds the workspace, reruns all deterministic tests, verifies the accepted Sprint 5 and Sprint 10 fixtures, regenerates this report in memory, and compares Markdown, JSON, CSV, and the manifest byte for byte.",
    "",
    "## Provenance inventory",
    "",
    "| Source file | Bytes | SHA-256 |",
    "|---|---:|---|",
    ...sourceRows,
    "",
    "The raw JSONL evidence remains the primary source of truth. This report and dashboard are derived views.",
    "",
  ].join("\n");
}

function renderCsv(report) {
  const header = [
    "report_version", "scenario", "route_id", "classification", "evidence_strength",
    "transaction_class", "expected_count", "complete_count", "missing_count",
    "invalid_exclusion_count", "success_count", "inconclusive_count",
    "policy_success_rate", "wilson95_low", "wilson95_high", "input_hash",
  ];
  const rows = report.controlledExperiment.scenarios.flatMap(scenario =>
    scenario.cells.map(cell => {
      const classification = scenario.classifications.find(value => value.routeId === cell.routeId);
      return [
        report.schemaVersion, scenario.scenario, cell.routeId, classification.classification,
        classification.evidenceStrength, cell.transactionClass, cell.expectedCount, cell.completeCount,
        cell.missingCount, cell.invalidExclusionCount, cell.successCount, cell.inconclusiveCount,
        fixed(cell.policySuccessRate), fixed(cell.wilson95.low), fixed(cell.wilson95.high), scenario.inputHash,
      ].map(csvField).join(",");
    }),
  );
  return `${[header.join(","), ...rows].join("\n")}\n`;
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

async function fileMetadata(path) {
  const content = await readFile(path);
  return {
    path: toPosix(relative(resolve("."), path)),
    bytes: content.byteLength,
    sha256: sha256(content),
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function assertExact(path, expected) {
  const actual = await readFile(path, "utf8");
  if (actual !== expected) throw new Error(`generated output differs: ${toPosix(relative(resolve("."), path))}`);
}

function canonicalJson(value) {
  return JSON.stringify(sortValue(value), null, 2);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function fixed(value) {
  return Number(value).toFixed(6);
}

function csvField(value) {
  const string = String(value);
  return /[",\n]/u.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}
