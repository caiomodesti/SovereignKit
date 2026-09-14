import { createHash } from "node:crypto";

import {
  createGrantM2OfficialSchedule,
  grantM2OfficialScheduleHash,
  validateGrantM2OfficialSchedule,
} from "./grant-m2-official-schedule.mjs";

export const GRANT_M2_OFFICIAL_RUN_VERSION = "GrantM2OfficialRun@0.1.0";
export const GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT = "Autorizo iniciar agora a janela oficial de 14 dias do M2 na Solana Devnet, somente se o preflight imediato passar, usando apenas quota gratuita e seguindo integralmente o precommitment congelado.";

const MINIMUM_LEAD_MS = 180_000;
const MAXIMUM_PREFLIGHT_AGE_MS = 900_000;

export function createGrantM2OfficialRun({
  runId,
  startAt,
  authorizedAt,
  authorizationText,
  preflightCapturedAt,
  preflightSha256,
  precommitmentSha256,
  sourceCommit,
  observerInitialSequences,
  quota,
}) {
  const start = canonicalTime(startAt);
  const authorized = canonicalTime(authorizedAt);
  const preflight = canonicalTime(preflightCapturedAt);
  if (authorizationText !== GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT || start < authorized + MINIMUM_LEAD_MS) {
    throw new Error("M2 official authorization text or lead time is invalid");
  }
  if (preflight > authorized || authorized - preflight > MAXIMUM_PREFLIGHT_AGE_MS || start - preflight > MAXIMUM_PREFLIGHT_AGE_MS ||
      !/^[a-f0-9]{64}$/u.test(preflightSha256 ?? "")) {
    throw new Error("M2 official preflight is missing, future-dated or stale");
  }
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit ?? "")) throw new Error("M2 official source commit is invalid");
  validateObserverSequences(observerInitialSequences);
  const schedule = createGrantM2OfficialSchedule({ runId, startAt, quota, precommitmentSha256 });
  const run = {
    schema_version: GRANT_M2_OFFICIAL_RUN_VERSION,
    status: "AUTHORIZED_NOT_STARTED",
    run_id: runId,
    source_commit: sourceCommit,
    observer_initial_sequences: structuredClone(observerInitialSequences),
    schedule,
    authorization: {
      schema_version: "GrantM2OfficialAuthorization@0.1.0",
      authorized: true,
      scope: "M2_OFFICIAL_FOURTEEN_DAY_WINDOW",
      exact_text_sha256: sha256(authorizationText),
      authorized_at: authorizedAt,
      not_before: schedule.start_at,
      not_after: schedule.end_at,
      schedule_sha256: grantM2OfficialScheduleHash(schedule),
      preflight_captured_at: preflightCapturedAt,
      preflight_sha256: preflightSha256,
      zero_incremental_spend_only: true,
      maximum_planned_devnet_transactions: 4_032,
      starts_official_fourteen_day_window: true,
    },
    qualifying_grant_units: 0,
    worker_instances_started: 0,
    official_window_started: false,
    milestone_2_started: false,
  };
  validateGrantM2OfficialRun(run, quota);
  return run;
}

export function validateGrantM2OfficialRun(run, quota) {
  validateGrantM2OfficialSchedule(run?.schedule, quota);
  const authorization = run?.authorization ?? {};
  if (run?.schema_version !== GRANT_M2_OFFICIAL_RUN_VERSION || run.status !== "AUTHORIZED_NOT_STARTED" ||
      !/^[a-f0-9]{40}$/u.test(run.source_commit ?? "") || run.run_id !== run.schedule.run_id ||
      !validObserverSequences(run.observer_initial_sequences) ||
      authorization.schema_version !== "GrantM2OfficialAuthorization@0.1.0" || authorization.authorized !== true ||
      authorization.scope !== "M2_OFFICIAL_FOURTEEN_DAY_WINDOW" ||
      authorization.exact_text_sha256 !== sha256(GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT) ||
      authorization.schedule_sha256 !== grantM2OfficialScheduleHash(run.schedule) ||
      authorization.not_before !== run.schedule.start_at || authorization.not_after !== run.schedule.end_at ||
      canonicalTime(authorization.not_before) < canonicalTime(authorization.authorized_at) + MINIMUM_LEAD_MS ||
      canonicalTime(authorization.preflight_captured_at) > canonicalTime(authorization.authorized_at) ||
      canonicalTime(authorization.authorized_at) - canonicalTime(authorization.preflight_captured_at) > MAXIMUM_PREFLIGHT_AGE_MS ||
      canonicalTime(authorization.not_before) - canonicalTime(authorization.preflight_captured_at) > MAXIMUM_PREFLIGHT_AGE_MS ||
      !/^[a-f0-9]{64}$/u.test(authorization.preflight_sha256 ?? "") ||
      authorization.zero_incremental_spend_only !== true || authorization.maximum_planned_devnet_transactions !== 4_032 ||
      authorization.starts_official_fourteen_day_window !== true || run.qualifying_grant_units !== 0 ||
      run.worker_instances_started !== 0 || run.official_window_started !== false || run.milestone_2_started !== false) {
    throw new Error("M2 official authorized run contract is invalid");
  }
  return {
    status: "PASS",
    gate: "GRANT_M2_OFFICIAL_RUN_AUTHORIZED_NOT_STARTED",
    plannedUnits: 4_032,
    officialWindowStarted: false,
  };
}

function validateObserverSequences(value) {
  if (!validObserverSequences(value)) throw new Error("M2 official observer initial sequences are invalid or incomplete");
}
function validObserverSequences(value) {
  const ids = ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"];
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...ids].sort().join("\n") && ids.every(id => Number.isSafeInteger(value[id]) && value[id] >= 0);
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function canonicalTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) throw new Error("canonical UTC timestamp required");
  return parsed;
}
