import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateGrantM2PrestartReadiness } from "../lib/grant-m2-prestart-readiness.mjs";

const snapshot = JSON.parse(await readFile("fixtures/grant-m2/prestart-readiness-20260912.json", "utf8"));
const artifacts = Object.fromEntries(await Promise.all(
  Object.values(snapshot.evidence).map(async binding => [binding.path, await readFile(binding.path, "utf8")]),
));

test("accepts the current blocked M2 pre-start evidence without starting the window", () => {
  assert.deepEqual(validateGrantM2PrestartReadiness(structuredClone(snapshot), artifacts), {
    status: "PASS",
    gate: "GRANT_M2_CURRENT_PRESTART_READINESS",
    readiness: "BLOCKED",
    provenControls: 13,
    remainingGates: 3,
    rehearsalTransactions: 12,
    qualifyingGrantUnits: 0,
    officialWindowStarted: false,
  });
});

test("rejects an altered or missing evidence binding", () => {
  const altered = structuredClone(snapshot);
  altered.evidence.rehearsal.sha256 = "0".repeat(64);
  assert.throws(() => validateGrantM2PrestartReadiness(altered, artifacts), /hash does not match/u);
});

test("rejects hiding the unobserved rehearsal transaction", () => {
  const relabeled = structuredClone(snapshot);
  relabeled.rehearsal_accounting.worker_finalized_transactions = 12;
  relabeled.rehearsal_accounting.acknowledged_without_worker_completion = 0;
  assert.throws(() => validateGrantM2PrestartReadiness(relabeled, artifacts), /accounting is incomplete or relabeled/u);
});

test("rejects semantic drift even when the changed artifact is rehashed", () => {
  const changedSnapshot = structuredClone(snapshot);
  const changedMonitor = JSON.parse(artifacts[changedSnapshot.evidence.live_monitor_deployment.path]);
  changedMonitor.hosts["observer-aws-a"].highest_severity = "WARNING";
  const changedContent = `${JSON.stringify(changedMonitor, null, 2)}\n`;
  changedSnapshot.evidence.live_monitor_deployment.sha256 = createHash("sha256").update(changedContent).digest("hex");
  const changedArtifacts = { ...artifacts, [changedSnapshot.evidence.live_monitor_deployment.path]: changedContent };
  assert.throws(() => validateGrantM2PrestartReadiness(changedSnapshot, changedArtifacts), /overstated or inconsistent/u);
});

test("rejects fabricated timer or notification activation evidence", () => {
  const changedSnapshot = structuredClone(snapshot);
  const path = changedSnapshot.evidence.live_monitor_activation.path;
  const changedActivation = JSON.parse(artifacts[path]);
  changedActivation.hosts["observer-aws-a"].timer_active = false;
  const changedContent = `${JSON.stringify(changedActivation, null, 2)}\n`;
  changedSnapshot.evidence.live_monitor_activation.sha256 = createHash("sha256").update(changedContent).digest("hex");
  const changedArtifacts = { ...artifacts, [path]: changedContent };
  assert.throws(() => validateGrantM2PrestartReadiness(changedSnapshot, changedArtifacts), /activation evidence is overstated or inconsistent/u);
});

test("rejects removing a gate or crossing the official-window boundary", () => {
  const hidden = structuredClone(snapshot);
  hidden.remaining_gates.pop();
  assert.throws(() => validateGrantM2PrestartReadiness(hidden, artifacts), /remaining gates are incomplete/u);

  const started = structuredClone(snapshot);
  started.official_window_started = true;
  assert.throws(() => validateGrantM2PrestartReadiness(started, artifacts), /unauthorized boundary/u);
});
