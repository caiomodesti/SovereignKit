import { createHash } from "node:crypto";

import { createGrantM2OfficialRun, validateGrantM2OfficialRun } from "./grant-m2-official-run.mjs";

export const GRANT_M2_OFFICIAL_REPLACEMENT_VERSION = "GrantM2OfficialReplacement@0.1.0";
export const GRANT_M2_INTERRUPTED_RUN_ID = "m2-official-20260914t163100000z";
export const GRANT_M2_INTERRUPTION_INCIDENT_ID = "official-transport-permission-denied";
export const GRANT_M2_INTERRUPTED_STATE_SHA256 = "6927da1cd611080dddf80feaee1973f4c58c339880f10ff9edccf12b3b02ec73";

export function createGrantM2OfficialReplacementRun({ quota, ...input }) {
  const run = createGrantM2OfficialRun({ quota, ...input });
  run.replacement_window = {
    schema_version: GRANT_M2_OFFICIAL_REPLACEMENT_VERSION,
    replaces_run_id: GRANT_M2_INTERRUPTED_RUN_ID,
    incident_id: GRANT_M2_INTERRUPTION_INCIDENT_ID,
    interrupted_state_aggregate_sha256: GRANT_M2_INTERRUPTED_STATE_SHA256,
    original_evidence_preserved: true,
    automatic_window_reset: false,
    explicit_replacement_decision_required: true,
  };
  validateGrantM2OfficialReplacementRun(run, quota);
  return run;
}

export function validateGrantM2OfficialReplacementRun(run, quota) {
  validateGrantM2OfficialRun(run, quota);
  const replacement = run?.replacement_window ?? {};
  if (!/^m2-official-replacement-[0-9]{8}t[0-9]{9}z$/u.test(run?.run_id ?? "") ||
      replacement.schema_version !== GRANT_M2_OFFICIAL_REPLACEMENT_VERSION ||
      replacement.replaces_run_id !== GRANT_M2_INTERRUPTED_RUN_ID ||
      replacement.incident_id !== GRANT_M2_INTERRUPTION_INCIDENT_ID ||
      replacement.interrupted_state_aggregate_sha256 !== GRANT_M2_INTERRUPTED_STATE_SHA256 ||
      replacement.original_evidence_preserved !== true || replacement.automatic_window_reset !== false ||
      replacement.explicit_replacement_decision_required !== true) {
    throw new Error("M2 official replacement-window binding is invalid");
  }
  return {
    status: "PASS",
    gate: "GRANT_M2_OFFICIAL_REPLACEMENT_AUTHORIZED_NOT_STARTED",
    runId: run.run_id,
    replacesRunId: replacement.replaces_run_id,
    sha256: createHash("sha256").update(JSON.stringify(run)).digest("hex"),
    officialWindowStarted: false,
  };
}
