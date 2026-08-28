import { readFile } from "node:fs/promises";
import { evaluateGrantM1OperatorReadiness } from "./lib/grant-m1-operator-readiness.mjs";
import { evaluateGrantM1ZeroCostAccountReadiness } from "./lib/grant-m1-zero-cost-account-readiness.mjs";

const requiredFiles = [
  "docs/project-master-plan.md",
  "docs/grant-pilot-plan.md",
  "docs/grant-milestone-1-status.md",
  "docs/adr/ADR-021-fail-closed-host-preflight.md",
  "docs/adr/ADR-022-grant-pilot-infrastructure-topology.md",
  "docs/adr/ADR-023-zero-cost-first-grant-pilot.md",
  "docs/grant-milestone-cost-plan.md",
  "deploy/grant-pilot/README.md",
  "deploy/grant-pilot/infrastructure-plan.json",
  "deploy/grant-pilot/zero-cost-candidate-plan.json",
  "deploy/grant-pilot/zero-cost-account-readiness.example.json",
  "deploy/grant-pilot/oracle-e4-collector-canary-plan.json",
  "docs/grant-m1-oracle-e4-collector-canary.md",
  "deploy/grant-pilot/Caddyfile.example",
  "deploy/grant-pilot/observer-runtime.example.json",
  "deploy/grant-pilot/reader-registry.example.json",
  "deploy/grant-pilot/assignment-authorities.example.json",
  "deploy/grant-pilot/systemd/sovereignkit-observer.service",
  "deploy/grant-pilot/systemd/sovereignkit-observation-worker@.service",
  "deploy/grant-pilot/systemd/sovereignkit-collector.service",
  "deploy/grant-pilot/systemd/sovereignkit-canary-soak@.service",
  "deploy/grant-pilot/systemd/sovereignkit-collector-canary-soak.service",
  "deploy/grant-pilot/operator-readiness.example.json",
  "docs/grant-m1-provider-onboarding.md",
  "scripts/lib/grant-m1-operator-readiness.mjs",
  "scripts/verify-grant-m1-operator-readiness.mjs",
  "scripts/tests/grant-m1-operator-readiness.test.mjs",
  "scripts/lib/grant-m1-canary-soak.mjs",
  "scripts/run-grant-m1-canary-soak.mjs",
  "scripts/tests/grant-m1-canary-soak.test.mjs",
  "scripts/lib/grant-m1-collector-canary-soak.mjs",
  "scripts/run-grant-m1-collector-canary-soak.mjs",
  "scripts/tests/grant-m1-collector-canary-soak.test.mjs",
  "scripts/lib/grant-m1-collector-durable-replay.mjs",
  "scripts/run-grant-m1-collector-durable-replay-drill.mjs",
  "scripts/tests/grant-m1-collector-durable-replay.test.mjs",
  "spec/grant-observer-registry.schema.json",
  "spec/grant-m1-evidence-index.schema.json",
  "packages/collector/src/observation-worker.ts",
  "packages/collector/src/observation-assignment.ts",
  "packages/collector/src/observer-runtime.ts",
  "packages/collector/integration/grant-m1-local-readiness.integration.test.ts",
  "scripts/run-grant-m1-local-readiness.ps1",
  "scripts/verify-grant-m1-local-readiness.mjs",
  "scripts/run-grant-m1-recovery-drill.ps1",
  "scripts/verify-grant-m1-recovery-drill.mjs",
  "scripts/verify-grant-m1-acceptance.mjs",
  "scripts/lib/grant-m1-acceptance.mjs",
  "scripts/lib/grant-m1-host-preflight.mjs",
  "scripts/lib/grant-m1-rpc-route-preflight.mjs",
  "scripts/capture-grant-m1-host-preflight.mjs",
  "scripts/run-grant-m1-rpc-route-preflight.mjs",
  "scripts/tests/grant-m1-acceptance-contracts.test.mjs",
  "scripts/tests/grant-m1-host-preflight.test.mjs",
  "scripts/lib/grant-m1-collector-host-preflight.mjs",
  "scripts/capture-grant-m1-collector-host-preflight.mjs",
  "scripts/tests/grant-m1-collector-host-preflight.test.mjs",
  "scripts/tests/grant-m1-rpc-route-preflight.test.mjs",
  "scripts/lib/grant-m1-infrastructure-plan.mjs",
  "scripts/verify-grant-m1-infrastructure-plan.mjs",
  "scripts/tests/grant-m1-infrastructure-plan.test.mjs",
  "scripts/lib/grant-m1-zero-cost-plan.mjs",
  "scripts/verify-grant-m1-zero-cost-plan.mjs",
  "scripts/tests/grant-m1-zero-cost-plan.test.mjs",
  "scripts/lib/grant-m1-zero-cost-account-readiness.mjs",
  "scripts/verify-grant-m1-zero-cost-account-readiness.mjs",
  "scripts/tests/grant-m1-zero-cost-account-readiness.test.mjs",
  "scripts/lib/grant-m1-oracle-e4-canary-plan.mjs",
  "scripts/verify-grant-m1-oracle-e4-canary-plan.mjs",
  "scripts/tests/grant-m1-oracle-e4-canary-plan.test.mjs",
  "deploy/grant-pilot/rpc-route-endpoint.example.txt",
  "deploy/grant-pilot/evidence-index.example.json",
  "fixtures/grant-m1/local-readiness-20260825.json",
  "fixtures/grant-m1/alchemy-devnet-route-20260826.json",
];

const contents = new Map(await Promise.all(requiredFiles.map(async path => [path, await readFile(path, "utf8")])));
const packageDocument = JSON.parse(await readFile("packages/collector/package.json", "utf8"));
for (const executable of ["sovereignkit-observer-keygen", "sovereignkit-assignment-keygen", "sovereignkit-assignment-sign", "sovereignkit-observation-worker", "sovereignkit-observer-runtime", "sovereignkit-collector"]) {
  if (typeof packageDocument.bin?.[executable] !== "string") throw new Error(`collector package is missing ${executable}`);
}
const observerConfig = JSON.parse(contents.get("deploy/grant-pilot/observer-runtime.example.json"));
if (observerConfig.schemaVersion !== "ObserverRuntimeConfig@0.1.0" || !String(observerConfig.collectorUrl).startsWith("https://")) {
  throw new Error("observer runtime example must use the versioned config and HTTPS");
}
if (!contents.get("deploy/grant-pilot/systemd/sovereignkit-observer.service").includes("NoNewPrivileges=true") ||
    !contents.get("deploy/grant-pilot/systemd/sovereignkit-collector.service").includes("ProtectSystem=strict") ||
    !contents.get("deploy/grant-pilot/systemd/sovereignkit-observation-worker@.service").includes("Type=oneshot") ||
    !contents.get("deploy/grant-pilot/systemd/sovereignkit-canary-soak@.service").includes("--duration-seconds 86400") ||
    !contents.get("deploy/grant-pilot/systemd/sovereignkit-collector-canary-soak.service").includes("--duration-seconds 86400")) {
  throw new Error("grant systemd templates are missing required hardening");
}
if (!contents.get("docs/grant-milestone-1-status.md").includes("Milestone 2 has not started")) {
  throw new Error("Milestone 1 status must preserve the Milestone 2 gate");
}
const readinessAnchor = JSON.parse(contents.get("fixtures/grant-m1/local-readiness-20260825.json"));
if (readinessAnchor.evidence_scope !== "LOCAL_SOFTWARE_READINESS_ONLY" || readinessAnchor.infrastructure_independence !== false || readinessAnchor.private_key_retained !== false) {
  throw new Error("local readiness anchor must preserve its non-independent, secret-free claim boundary");
}
const rpcRouteAnchor = JSON.parse(contents.get("fixtures/grant-m1/alchemy-devnet-route-20260826.json"));
if (rpcRouteAnchor.schema_version !== "GrantM1RpcRoutePreflight@0.1.0" ||
    rpcRouteAnchor.scope !== "SINGLE_LOGICAL_RPC_ROUTE_PREFLIGHT_ONLY" ||
    rpcRouteAnchor.logical_endpoint_origin !== "https://solana-devnet.g.alchemy.com" ||
    rpcRouteAnchor.credential_material_persisted !== false ||
    rpcRouteAnchor.operational_independence_established !== false ||
    rpcRouteAnchor.milestone_acceptance_effect !== "NONE") {
  throw new Error("Alchemy Devnet route anchor must remain sanitized and make no observer-independence claim");
}
if (!contents.get("scripts/lib/grant-m1-acceptance.mjs").includes("GrantM1EvidenceIndex@0.3.0") ||
    !contents.get("scripts/lib/grant-m1-acceptance.mjs").includes("assignment signature is invalid") ||
    !contents.get("scripts/lib/grant-m1-acceptance.mjs").includes("signed result signature is invalid")) {
  throw new Error("grant acceptance verifier must enforce the hashed v0.3 evidence contract plus assignment and observer signatures");
}
if (!contents.get("scripts/lib/grant-m1-host-preflight.mjs").includes("GrantM1HostPreflight@0.1.0") ||
    !contents.get("scripts/capture-grant-m1-host-preflight.mjs").includes("NTPSynchronized") ||
    !contents.get("scripts/capture-grant-m1-host-preflight.mjs").includes("systemctl")) {
  throw new Error("grant host preflight must retain its versioned clock and service checks");
}
if (!contents.get("scripts/lib/grant-m1-collector-host-preflight.mjs").includes("GrantM1CollectorHostPreflight@0.1.0") ||
    !contents.get("scripts/capture-grant-m1-collector-host-preflight.mjs").includes("runtime manifest SHA-256 mismatch") ||
    !contents.get("scripts/capture-grant-m1-collector-host-preflight.mjs").includes("loopbackBindingExclusive")) {
  throw new Error("Collector host preflight must retain versioned artifact and loopback checks");
}
if (!contents.get("scripts/lib/grant-m1-collector-canary-soak.mjs").includes("GrantM1CollectorCanarySoakSummary@0.1.0") ||
    !contents.get("scripts/lib/grant-m1-collector-canary-soak.mjs").includes("stored_count_regressed") ||
    !contents.get("scripts/run-grant-m1-collector-canary-soak.mjs").includes("output.sync()")) {
  throw new Error("Collector canary must retain versioning, storage-regression detection, and fsynced samples");
}
if (!contents.get("scripts/lib/grant-m1-collector-durable-replay.mjs").includes("GrantM1CollectorDurableReplay@0.1.0") ||
    !contents.get("scripts/run-grant-m1-collector-durable-replay-drill.mjs").includes("systemctl") ||
    !contents.get("scripts/run-grant-m1-collector-durable-replay-drill.mjs").includes("replayStatus")) {
  throw new Error("Collector durable replay drill must preserve restart and idempotency checks");
}
if (!contents.get("scripts/lib/grant-m1-rpc-route-preflight.mjs").includes("GrantM1RpcRoutePreflight@0.1.0") ||
    !contents.get("scripts/lib/grant-m1-rpc-route-preflight.mjs").includes("operational_independence_established: false") ||
    !contents.get("scripts/run-grant-m1-rpc-route-preflight.mjs").includes(".secrets/alchemy-devnet-endpoint.txt")) {
  throw new Error("grant RPC route preflight must remain versioned, secret-file based, and non-independent");
}
const infrastructurePlan = JSON.parse(contents.get("deploy/grant-pilot/infrastructure-plan.json"));
if (infrastructurePlan.schema_version !== "GrantM1InfrastructurePlan@0.1.0" ||
    infrastructurePlan.billing_authorized !== false ||
    infrastructurePlan.status !== "PLANNED_NOT_PROVISIONED" ||
    infrastructurePlan.activation_policy?.mode !== "PAID_FALLBACK_ONLY" ||
    infrastructurePlan.activation_policy?.operator_spend_authorization !== "NOT_AUTHORIZED") {
  throw new Error("grant infrastructure plan must remain versioned, unprovisioned, and unable to authorize billing");
}
const zeroCostPlan = JSON.parse(contents.get("deploy/grant-pilot/zero-cost-candidate-plan.json"));
if (zeroCostPlan.schema_version !== "GrantM1ZeroCostCandidatePlan@0.1.0" ||
    zeroCostPlan.status !== "RESEARCH_COMPLETE_ACCOUNT_VALIDATION_REQUIRED" ||
    zeroCostPlan.cash_spend_authorized !== false ||
    zeroCostPlan.components?.some(component => component.provisioned !== false || component.admitted !== false)) {
  throw new Error("zero-cost candidate plan must remain researched, unprovisioned, and unaccepted");
}
const oracleE4Canary = JSON.parse(contents.get("deploy/grant-pilot/oracle-e4-collector-canary-plan.json"));
if (oracleE4Canary.schema_version !== "GrantM1OracleE4CollectorCanaryPlan@0.3.0" ||
    oracleE4Canary.status !== "PROVISIONED_CANARY_NOT_ADMITTED" ||
    oracleE4Canary.scope !== "COLLECTOR_CANARY_ONLY" ||
    oracleE4Canary.billing_authorized_by_repository !== false ||
    oracleE4Canary.candidate?.provisioned !== true ||
    oracleE4Canary.candidate?.admitted !== false ||
    oracleE4Canary.admission_gates?.full_vm_restart_recovery_passed !== true ||
    oracleE4Canary.admission_gates?.collector_durable_replay_recovery_passed !== false ||
    oracleE4Canary.methodology_boundaries?.milestone_2_started !== false) {
  throw new Error("Oracle E4 Collector canary plan must remain bounded, provisioned, and unaccepted");
}
const operatorReadiness = evaluateGrantM1OperatorReadiness(JSON.parse(contents.get("deploy/grant-pilot/operator-readiness.example.json")));
if (operatorReadiness.status !== "ACTION_REQUIRED" || operatorReadiness.blockers.length === 0) {
  throw new Error("checked-in operator readiness example must remain blocked and secret-free");
}
const zeroCostAccountReadiness = evaluateGrantM1ZeroCostAccountReadiness(JSON.parse(contents.get("deploy/grant-pilot/zero-cost-account-readiness.example.json")));
if (zeroCostAccountReadiness.status !== "ACTION_REQUIRED" || zeroCostAccountReadiness.blockers.length === 0) {
  throw new Error("checked-in zero-cost account readiness example must remain blocked and secret-free");
}
process.stdout.write(`${JSON.stringify({ status: "PASS", gate: "GRANT_M1_SOFTWARE", requiredFiles: requiredFiles.length })}\n`);
