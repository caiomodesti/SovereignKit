export const GRANT_M1_COLLECTOR_CANARY_SAMPLE_VERSION = "GrantM1CollectorCanarySoakSample@0.1.0";
export const GRANT_M1_COLLECTOR_CANARY_SUMMARY_VERSION = "GrantM1CollectorCanarySoakSummary@0.1.0";

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/u;
const ERROR_CODES = new Set(["TIMEOUT", "NETWORK_ERROR", "HTTP_ERROR", "INVALID_JSON", "NOT_READY", "ABORTED"]);

export function validateCollectorLoopbackHealthUrl(value) {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "http:" || !loopback || url.pathname !== "/health" || url.username || url.password || url.search || url.hash) {
    throw new Error("health-url must be an unauthenticated loopback HTTP /health endpoint");
  }
  return url;
}

export function createGrantM1CollectorCanarySample(input) {
  baseInput(input);
  if (input.errorCode !== undefined) {
    if (!ERROR_CODES.has(input.errorCode)) throw new Error("Collector canary errorCode is invalid");
    return sample(input, { httpStatus: null, storedCount: null, ready: false, errorCode: input.errorCode });
  }
  if (!Number.isSafeInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599) throw new Error("httpStatus is invalid");
  const snapshot = input.healthSnapshot;
  const storedCount = snapshot !== null && typeof snapshot === "object" && Number.isSafeInteger(snapshot.storedCount) && snapshot.storedCount >= 0 ? snapshot.storedCount : null;
  const ready = input.httpStatus === 200 && snapshot?.status === "ok" && storedCount !== null;
  const errorCode = ready ? null : input.httpStatus !== 200 ? "HTTP_ERROR" : "NOT_READY";
  return sample(input, { httpStatus: input.httpStatus, storedCount, ready, errorCode });
}

export function evaluateGrantM1CollectorCanarySoak({ componentId, intervalSeconds, samples, requiredDurationSeconds = 86_400 }) {
  if (!IDENTIFIER.test(componentId)) throw new Error("componentId is invalid");
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 15 || intervalSeconds > 300) throw new Error("intervalSeconds must be from 15 to 300");
  if (!Number.isSafeInteger(requiredDurationSeconds) || requiredDurationSeconds < 86_400) throw new Error("Collector canary duration cannot be shorter than 24 hours");
  if (!Array.isArray(samples) || samples.length < 1) throw new Error("Collector canary samples are incomplete");

  let previousAt = -1, previousElapsed = -1, previousStoredCount = -1, maxGapMs = 0, storageRegressions = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    validateSample(current, componentId, index);
    const at = Date.parse(current.captured_at);
    if (at <= previousAt || current.elapsed_ms <= previousElapsed) throw new Error("Collector canary time sequence is not strictly increasing");
    if (previousElapsed >= 0) maxGapMs = Math.max(maxGapMs, current.elapsed_ms - previousElapsed);
    else maxGapMs = current.elapsed_ms;
    if (current.stored_count !== null) {
      if (current.stored_count < previousStoredCount) storageRegressions += 1;
      previousStoredCount = current.stored_count;
    }
    previousAt = at; previousElapsed = current.elapsed_ms;
  }

  // elapsed_ms is measured from the runner's monotonic start, so the final
  // sample already represents the full soak duration. Subtracting the first
  // sample's request latency can falsely reject an otherwise complete run.
  const actualDurationMs = samples.at(-1).elapsed_ms;
  const expectedSamples = Math.floor(actualDurationMs / (intervalSeconds * 1000)) + 1;
  const coverageRatio = Math.min(1, samples.length / expectedSamples);
  const readySamples = samples.filter(value => value.ready).length;
  const readinessRatio = readySamples / samples.length;
  const blockers = [];
  if (actualDurationMs < requiredDurationSeconds * 1000) blockers.push("duration_below_24_hours");
  if (coverageRatio < 0.95) blockers.push("sample_coverage_below_95_percent");
  if (readinessRatio < 0.99) blockers.push("readiness_below_99_percent");
  if (maxGapMs > intervalSeconds * 3000) blockers.push("sample_gap_above_three_intervals");
  if (storageRegressions > 0) blockers.push("stored_count_regressed");

  return {
    schema_version: GRANT_M1_COLLECTOR_CANARY_SUMMARY_VERSION,
    component_id: componentId,
    started_at: samples[0].captured_at,
    completed_at: samples.at(-1).captured_at,
    actual_duration_seconds: Math.floor(actualDurationMs / 1000),
    required_duration_seconds: requiredDurationSeconds,
    interval_seconds: intervalSeconds,
    sample_count: samples.length,
    expected_sample_count: expectedSamples,
    ready_sample_count: readySamples,
    coverage_ratio: coverageRatio,
    readiness_ratio: readinessRatio,
    storage_regression_count: storageRegressions,
    maximum_gap_ms: maxGapMs,
    admission_thresholds: { minimum_duration_seconds: 86_400, minimum_coverage_ratio: 0.95, minimum_readiness_ratio: 0.99, maximum_gap_intervals: 3, storage_regressions_allowed: 0 },
    admitted: blockers.length === 0,
    blockers,
  };
}

function baseInput(input) {
  if (!IDENTIFIER.test(input.componentId)) throw new Error("componentId is invalid");
  if (!Number.isSafeInteger(input.sampleIndex) || input.sampleIndex < 0) throw new Error("sampleIndex is invalid");
  if (!canonicalTimestamp(input.capturedAt)) throw new Error("capturedAt must be canonical");
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0 || !Number.isFinite(input.latencyMs) || input.latencyMs < 0) throw new Error("Collector canary timing is invalid");
}
function sample(input, result) {
  return { schema_version: GRANT_M1_COLLECTOR_CANARY_SAMPLE_VERSION, component_id: input.componentId, sample_index: input.sampleIndex, captured_at: input.capturedAt, elapsed_ms: Math.round(input.elapsedMs), latency_ms: Math.round(input.latencyMs), http_status: result.httpStatus, stored_count: result.storedCount, ready: result.ready, error_code: result.errorCode };
}
function validateSample(value, componentId, index) {
  if (value?.schema_version !== GRANT_M1_COLLECTOR_CANARY_SAMPLE_VERSION || value.component_id !== componentId || value.sample_index !== index || !canonicalTimestamp(value.captured_at) || !Number.isSafeInteger(value.elapsed_ms) || value.elapsed_ms < 0 || !Number.isFinite(value.latency_ms) || value.latency_ms < 0 || typeof value.ready !== "boolean" || (value.http_status !== null && (!Number.isSafeInteger(value.http_status) || value.http_status < 100 || value.http_status > 599)) || (value.stored_count !== null && (!Number.isSafeInteger(value.stored_count) || value.stored_count < 0)) || (value.error_code !== null && !ERROR_CODES.has(value.error_code))) throw new Error(`Collector canary sample is invalid at index ${index}`);
  if (value.ready) {
    if (value.http_status !== 200 || value.stored_count === null || value.error_code !== null) throw new Error(`Collector canary sample outcome is inconsistent at index ${index}`);
  } else if (value.error_code === null) throw new Error(`Collector canary sample outcome is inconsistent at index ${index}`);
}
function canonicalTimestamp(value) { if (typeof value !== "string") return false; const parsed = Date.parse(value); return Number.isFinite(parsed) && new Date(parsed).toISOString() === value; }
