export const GRANT_M1_COLLECTOR_DURABLE_REPLAY_VERSION = "GrantM1CollectorDurableReplay@0.1.0";

export function evaluateCollectorDurableReplay(input) {
  if (!canonical(input.capturedAt)) throw new Error("capturedAt must be canonical");
  if (input.beforeStoredCount !== 0 || input.acceptStatus !== "ACCEPTED" || input.afterAcceptStoredCount !== 1) throw new Error("Collector first durable ingest did not append exactly one result");
  if (input.serviceRestarted !== true || input.afterRestartStoredCount !== 1) throw new Error("Collector did not reconstruct durable state after restart");
  if (input.replayStatus !== "DUPLICATE" || input.afterReplayStoredCount !== 1 || input.evidenceRecordCount !== 1) throw new Error("Collector replay was not idempotent");
  if (input.evidenceMode !== 0o600) throw new Error("Collector evidence mode drifted from 0600");
  return {
    schema_version: GRANT_M1_COLLECTOR_DURABLE_REPLAY_VERSION,
    captured_at: input.capturedAt,
    passed: true,
    checks: { first_ingest_accepted: true, exactly_one_durable_record: true, restart_reconstructed_state: true, replay_rejected_as_duplicate: true, evidence_mode_0600: true },
  };
}

function canonical(value) { if (typeof value !== "string") return false; const parsed = Date.parse(value); return Number.isFinite(parsed) && new Date(parsed).toISOString() === value; }
