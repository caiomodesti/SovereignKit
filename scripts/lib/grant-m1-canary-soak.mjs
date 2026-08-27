export const GRANT_M1_CANARY_SAMPLE_VERSION = "GrantM1CanarySoakSample@0.1.0";
export const GRANT_M1_CANARY_SUMMARY_VERSION = "GrantM1CanarySoakSummary@0.1.0";

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/u;
const ERROR_CODES = new Set(["TIMEOUT", "NETWORK_ERROR", "HTTP_ERROR", "INVALID_JSON", "IDENTITY_MISMATCH", "NOT_READY", "ABORTED"]);

export function validateLoopbackReadyUrl(value) {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "http:" || !loopback || url.pathname !== "/ready" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Error("health-url must be an unauthenticated loopback HTTP /ready endpoint");
  }
  return url;
}

export function createGrantM1CanarySample(input) {
  if (!IDENTIFIER.test(input.observerId)) throw new Error("observerId is invalid");
  if (!Number.isSafeInteger(input.sampleIndex) || input.sampleIndex < 0) throw new Error("sampleIndex is invalid");
  if (!isCanonicalTimestamp(input.capturedAt)) throw new Error("capturedAt must be canonical");
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0) throw new Error("elapsedMs is invalid");
  if (!Number.isFinite(input.latencyMs) || input.latencyMs < 0) throw new Error("latencyMs is invalid");

  if (input.errorCode !== undefined) {
    if (!ERROR_CODES.has(input.errorCode)) throw new Error("canary errorCode is invalid");
    return {
      schema_version: GRANT_M1_CANARY_SAMPLE_VERSION,
      observer_id: input.observerId,
      sample_index: input.sampleIndex,
      captured_at: input.capturedAt,
      elapsed_ms: Math.round(input.elapsedMs),
      latency_ms: Math.round(input.latencyMs),
      http_status: null,
      reported_observer_id: null,
      identity_match: null,
      ready: false,
      error_code: input.errorCode,
    };
  }

  if (!Number.isSafeInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599) throw new Error("httpStatus is invalid");
  const snapshot = input.healthSnapshot;
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("healthSnapshot is invalid");
  const reportedObserverId = typeof snapshot.observerId === "string" ? snapshot.observerId : null;
  const identityMatch = reportedObserverId === input.observerId;
  const ready = input.httpStatus === 200 && snapshot.status === "ready" && identityMatch;
  const errorCode = ready ? null : !identityMatch ? "IDENTITY_MISMATCH" : input.httpStatus !== 200 ? "HTTP_ERROR" : "NOT_READY";
  return {
    schema_version: GRANT_M1_CANARY_SAMPLE_VERSION,
    observer_id: input.observerId,
    sample_index: input.sampleIndex,
    captured_at: input.capturedAt,
    elapsed_ms: Math.round(input.elapsedMs),
    latency_ms: Math.round(input.latencyMs),
    http_status: input.httpStatus,
    reported_observer_id: reportedObserverId,
    identity_match: identityMatch,
    ready,
    error_code: errorCode,
  };
}

export function evaluateGrantM1CanarySoak({ observerId, intervalSeconds, samples, requiredDurationSeconds = 86_400 }) {
  if (!IDENTIFIER.test(observerId)) throw new Error("observerId is invalid");
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 15 || intervalSeconds > 300) throw new Error("intervalSeconds must be from 15 to 300");
  if (!Number.isSafeInteger(requiredDurationSeconds) || requiredDurationSeconds < 86_400) throw new Error("canary duration cannot be shorter than 24 hours");
  if (!Array.isArray(samples) || samples.length < 1) throw new Error("canary samples are incomplete");

  let previousAt = -1;
  let previousElapsedMs = -1;
  let maxGapMs = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample?.schema_version !== GRANT_M1_CANARY_SAMPLE_VERSION || sample.observer_id !== observerId || sample.sample_index !== index) {
      throw new Error(`canary sample identity or sequence is invalid at index ${index}`);
    }
    if (!isCanonicalTimestamp(sample.captured_at) || typeof sample.ready !== "boolean" ||
        !Number.isSafeInteger(sample.elapsed_ms) || sample.elapsed_ms < 0 ||
        !Number.isFinite(sample.latency_ms) || sample.latency_ms < 0 ||
        (sample.http_status !== null && (!Number.isSafeInteger(sample.http_status) || sample.http_status < 100 || sample.http_status > 599)) ||
        (sample.reported_observer_id !== null && (typeof sample.reported_observer_id !== "string" || !IDENTIFIER.test(sample.reported_observer_id))) ||
        (sample.identity_match !== true && sample.identity_match !== false && sample.identity_match !== null) ||
        (sample.error_code !== null && !ERROR_CODES.has(sample.error_code))) {
      throw new Error(`canary sample content is invalid at index ${index}`);
    }
    validateSampleOutcome(sample, observerId, index);
    const at = Date.parse(sample.captured_at);
    if (at <= previousAt) throw new Error("canary sample timestamps must be strictly increasing");
    if (sample.elapsed_ms <= previousElapsedMs) throw new Error("canary monotonic elapsed time must be strictly increasing");
    if (previousElapsedMs >= 0) maxGapMs = Math.max(maxGapMs, sample.elapsed_ms - previousElapsedMs);
    previousAt = at;
    previousElapsedMs = sample.elapsed_ms;
  }

  const startedAt = samples[0].captured_at;
  const completedAt = samples.at(-1).captured_at;
  const actualDurationMs = samples.at(-1).elapsed_ms - samples[0].elapsed_ms;
  const requiredDurationMs = requiredDurationSeconds * 1000;
  const expectedSamples = Math.floor(actualDurationMs / (intervalSeconds * 1000)) + 1;
  const coverageRatio = Math.min(1, samples.length / expectedSamples);
  const readySamples = samples.filter(sample => sample.ready).length;
  const readyRatio = readySamples / samples.length;
  const identityMismatches = samples.filter(sample => sample.identity_match === false).length;
  const blockers = [];
  if (actualDurationMs < requiredDurationMs) blockers.push("duration_below_24_hours");
  if (coverageRatio < 0.95) blockers.push("sample_coverage_below_95_percent");
  if (readyRatio < 0.99) blockers.push("readiness_below_99_percent");
  if (identityMismatches > 0) blockers.push("observer_identity_mismatch");
  if (maxGapMs > intervalSeconds * 3000) blockers.push("sample_gap_above_three_intervals");

  return {
    schema_version: GRANT_M1_CANARY_SUMMARY_VERSION,
    observer_id: observerId,
    started_at: startedAt,
    completed_at: completedAt,
    actual_duration_seconds: Math.floor(actualDurationMs / 1000),
    required_duration_seconds: requiredDurationSeconds,
    interval_seconds: intervalSeconds,
    sample_count: samples.length,
    expected_sample_count: expectedSamples,
    ready_sample_count: readySamples,
    coverage_ratio: coverageRatio,
    readiness_ratio: readyRatio,
    identity_mismatch_count: identityMismatches,
    maximum_gap_ms: maxGapMs,
    admission_thresholds: {
      minimum_duration_seconds: 86_400,
      minimum_coverage_ratio: 0.95,
      minimum_readiness_ratio: 0.99,
      maximum_gap_intervals: 3,
      identity_mismatches_allowed: 0,
    },
    admitted: blockers.length === 0,
    blockers,
  };
}

function validateSampleOutcome(sample, observerId, index) {
  if (sample.identity_match === null) {
    const transportErrors = new Set(["TIMEOUT", "NETWORK_ERROR", "INVALID_JSON", "ABORTED"]);
    if (sample.http_status !== null || sample.reported_observer_id !== null || sample.ready || !transportErrors.has(sample.error_code)) {
      throw new Error(`canary sample outcome is inconsistent at index ${index}`);
    }
    return;
  }
  const expectedIdentityMatch = sample.reported_observer_id === observerId;
  const expectedReady = sample.http_status === 200 && expectedIdentityMatch && sample.error_code === null;
  const expectedError = !expectedIdentityMatch ? "IDENTITY_MISMATCH" : sample.http_status !== 200 ? "HTTP_ERROR" : sample.ready ? null : "NOT_READY";
  if (sample.identity_match !== expectedIdentityMatch || sample.ready !== expectedReady || sample.error_code !== expectedError) {
    throw new Error(`canary sample outcome is inconsistent at index ${index}`);
  }
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
