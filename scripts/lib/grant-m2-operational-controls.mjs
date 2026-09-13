import { createHash } from "node:crypto";

export const GRANT_M2_BACKUP_MANIFEST_VERSION = "GrantM2BackupManifest@0.1.0";
export const GRANT_M2_DAILY_SUMMARY_VERSION = "GrantM2DailySummary@0.1.0";
export const GRANT_M2_INCIDENT_LOG_VERSION = "GrantM2IncidentLog@0.1.0";
export const GRANT_M2_REHEARSAL_LEDGER_VERSION = "GrantM2RehearsalTransactionLedger@0.1.0";
export const GRANT_M2_RESOURCE_REVALIDATION_VERSION = "GrantM2ResourceRevalidation@0.1.0";

export function createBackupManifest({ sourceBytes, backupBytes, capturedAt, sourceLabel, destinationLabel }) {
  canonicalTime(capturedAt);
  if (!(sourceBytes instanceof Uint8Array) || !(backupBytes instanceof Uint8Array) || sourceBytes.length === 0) {
    throw new Error("backup source and restored bytes must be non-empty byte arrays");
  }
  if (!safeLabel(sourceLabel) || !safeLabel(destinationLabel) || sourceLabel === destinationLabel) {
    throw new Error("backup source and destination labels must be distinct and sanitized");
  }
  const sourceSha256 = sha256(sourceBytes);
  const restoredSha256 = sha256(backupBytes);
  if (sourceBytes.length !== backupBytes.length || sourceSha256 !== restoredSha256) {
    throw new Error("backup restore bytes do not match the source");
  }
  const records = parseJsonl(sourceBytes, "backup source");
  return {
    schema_version: GRANT_M2_BACKUP_MANIFEST_VERSION,
    captured_at: capturedAt,
    source_label: sourceLabel,
    destination_label: destinationLabel,
    byte_length: sourceBytes.length,
    record_count: records.length,
    source_sha256: sourceSha256,
    restored_sha256: restoredSha256,
    byte_identical_restore: true,
    separate_location_proven: false,
    external_rehearsal_effect: "NONE",
  };
}

export function createDailySummary({ ledgerText, collectorText, dayIndex, windowId, generatedAt }) {
  canonicalTime(generatedAt);
  if (!Number.isSafeInteger(dayIndex) || dayIndex < 0 || dayIndex > 13 || !safeLabel(windowId)) {
    throw new Error("daily summary identity is invalid");
  }
  const ledger = parseJsonl(Buffer.from(ledgerText), "cycle ledger");
  const collector = parseJsonl(Buffer.from(collectorText), "collector log", { allowEmpty: true });
  const resultIds = new Set();
  for (let index = 0; index < collector.length; index += 1) {
    const record = collector[index];
    if (record.collector_sequence !== index || typeof record.result?.result_id !== "string") {
      throw new Error("collector sequence or result identity is invalid");
    }
    if (resultIds.has(record.result.result_id)) throw new Error("collector result identity is duplicated");
    resultIds.add(record.result.result_id);
  }
  const unitIds = new Set();
  const counts = { QUALIFYING: 0, REJECTED: 0, MISSING: 0, INVALID: 0 };
  const byObserverRoute = {};
  for (const entry of ledger) {
    if (typeof entry.unit_id !== "string" || unitIds.has(entry.unit_id) || !(entry.status in counts)) {
      throw new Error("cycle ledger unit or status is invalid");
    }
    unitIds.add(entry.unit_id);
    counts[entry.status] += 1;
    const key = `${entry.observer_id}|${entry.route_id}`;
    byObserverRoute[key] ??= { QUALIFYING: 0, REJECTED: 0, MISSING: 0, INVALID: 0 };
    byObserverRoute[key][entry.status] += 1;
    if (entry.status === "QUALIFYING" && (typeof entry.result_id !== "string" || !resultIds.has(entry.result_id))) {
      throw new Error("qualifying ledger unit is absent from Collector evidence");
    }
    if (entry.status !== "QUALIFYING" && entry.result_id !== null) {
      throw new Error("non-qualifying ledger unit must not claim a Collector result");
    }
  }
  if (counts.QUALIFYING !== resultIds.size) throw new Error("Collector contains results absent from the cycle ledger");
  return {
    schema_version: GRANT_M2_DAILY_SUMMARY_VERSION,
    generated_at: generatedAt,
    window_id: windowId,
    day_index: dayIndex,
    counts,
    total_expected_units: ledger.length,
    collector_records: collector.length,
    by_observer_route: Object.fromEntries(Object.entries(byObserverRoute).sort(([a], [b]) => a.localeCompare(b))),
    ledger_sha256: sha256(Buffer.from(ledgerText)),
    collector_sha256: sha256(Buffer.from(collectorText)),
  };
}

export function validateIncidentLog(text) {
  const records = parseJsonl(Buffer.from(text), "incident log");
  const ids = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.schema_version !== GRANT_M2_INCIDENT_LOG_VERSION || record.sequence !== index ||
        !safeLabel(record.incident_id) || ids.has(record.incident_id)) throw new Error("incident identity or sequence is invalid");
    ids.add(record.incident_id);
    canonicalTime(record.opened_at);
    if (!["OPEN", "RESOLVED", "ACCEPTANCE_BLOCKING"].includes(record.status) ||
        !["COLLECTOR", "OBSERVER", "SCHEDULER", "ROUTE", "EXPORT", "CLOCK", "INTEGRITY", "ALERT"].includes(record.component) ||
        typeof record.summary !== "string" || record.summary.length < 8 || record.summary.length > 240 ||
        record.raw_evidence_preserved !== true || record.automatic_window_reset !== false) {
      throw new Error("incident record is incomplete or weakens preservation rules");
    }
  }
  return { status: "PASS", gate: "GRANT_M2_INCIDENT_LOG", records: records.length, sha256: sha256(Buffer.from(text)) };
}

export function validateRehearsalTransactionLedger(text) {
  const records = parseJsonl(Buffer.from(text), "rehearsal transaction ledger");
  if (records.length !== 12) throw new Error("rehearsal ledger must contain exactly 12 submitted transactions");
  const signatures = new Set(); const slots = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    canonicalTime(record.submitted_at);
    if (record.schema_version !== GRANT_M2_REHEARSAL_LEDGER_VERSION || record.sequence !== index ||
        !safeLabel(record.source_run) || !/^[a-f0-9]{64}$/u.test(record.slot_id) || typeof record.assignment_id !== "string" ||
        typeof record.signature !== "string" || signatures.has(record.signature) || slots.has(record.slot_id) ||
        !["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"].includes(record.observer_id) ||
        !["alchemy-solana-devnet", "solana-public-devnet"].includes(record.route_id) ||
        !["FINALIZED", "ACKNOWLEDGED_UNOBSERVED"].includes(record.terminal_status) || record.qualifying_units !== 0 ||
        record.official_window_started !== false) throw new Error("rehearsal ledger record is invalid or duplicated");
    signatures.add(record.signature); slots.add(record.slot_id);
  }
  const finalized = records.filter(record => record.terminal_status === "FINALIZED").length;
  const unobserved = records.filter(record => record.terminal_status === "ACKNOWLEDGED_UNOBSERVED").length;
  if (finalized !== 11 || unobserved !== 1) throw new Error("rehearsal ledger terminal accounting is invalid");
  return { status: "PASS", gate: "GRANT_M2_REHEARSAL_TRANSACTION_LEDGER", records: 12, finalized, acknowledgedUnobserved: unobserved, uniqueSignatures: 12, qualifyingUnits: 0, officialWindowStarted: false, sha256: sha256(Buffer.from(text)) };
}

export function validateResourceRevalidation(record) {
  if (record === null || typeof record !== "object" || record.schema_version !== GRANT_M2_RESOURCE_REVALIDATION_VERSION || record.status !== "PASS") {
    throw new Error("M2 resource revalidation status or version is invalid");
  }
  canonicalTime(record.captured_at);
  const measurement = record.rehearsal_measurement ?? {};
  if (record.planned_units !== 4032 || measurement.units !== 9 || measurement.raw_polls !== 15 ||
      measurement.observed_coordinator_compute_units !== 200 || measurement.derived_worker_alchemy_compute_units !== 600 ||
      measurement.observed_total_compute_units !== 800 || measurement.observed_total_compute_units !== measurement.observed_coordinator_compute_units + measurement.derived_worker_alchemy_compute_units ||
      measurement.projected_variable_compute_units !== measurement.observed_total_compute_units * record.planned_units / measurement.units ||
      measurement.frozen_upper_compute_units_with_contingency !== 5854464 || measurement.maximum_slot_evidence_bytes !== 5801 ||
      measurement.projected_max_slot_storage_bytes !== measurement.maximum_slot_evidence_bytes * record.planned_units) {
    throw new Error("M2 resource revalidation measurement arithmetic is invalid");
  }
  const quota = record.alchemy_account_quota ?? {};
  if (quota.status !== "PASS" || quota.period !== "current_month_utc" || quota.captured_via !== "authenticated_alchemy_dashboard_usage_page" ||
      quota.used_compute_units !== 3730 || quota.limit_compute_units !== 30000000 ||
      quota.remaining_compute_units !== quota.limit_compute_units - quota.used_compute_units ||
      quota.frozen_upper_compute_units_with_contingency !== measurement.frozen_upper_compute_units_with_contingency ||
      quota.remaining_after_frozen_upper_compute_units !== quota.remaining_compute_units - quota.frozen_upper_compute_units_with_contingency ||
      quota.frozen_upper_fits_remaining_quota !== true || quota.remaining_after_frozen_upper_compute_units <= 0) {
    throw new Error("M2 authenticated Alchemy quota evidence is invalid");
  }
  const feePayer = record.fee_payer ?? {};
  if (feePayer.balance_lamports !== 90895000 || feePayer.projected_fees_lamports_at_5000_per_unit !== record.planned_units * 5000 ||
      feePayer.projected_remaining_lamports !== feePayer.balance_lamports - feePayer.projected_fees_lamports_at_5000_per_unit ||
      feePayer.projected_remaining_lamports <= 0) throw new Error("M2 fee payer capacity arithmetic is invalid");
  const expectedHosts = ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"];
  if (JSON.stringify(Object.keys(record.hosts ?? {}).sort()) !== JSON.stringify(expectedHosts.sort())) throw new Error("M2 resource host set is invalid");
  for (const host of Object.values(record.hosts)) {
    if (!Number.isSafeInteger(host.cpu_count) || host.cpu_count < 1 || !Number.isSafeInteger(host.memory_available_kb) || host.memory_available_kb < 524288 ||
        !Number.isSafeInteger(host.disk_available_kb) || host.disk_available_kb < 5242880 || host.ntp_synchronized !== true || host.observer_active !== true) {
      throw new Error("M2 host resource floor is not satisfied");
    }
  }
  if (JSON.stringify(record.risks) !== JSON.stringify([
    "google_memory_headroom_is_the_smallest_and_requires_live_alerting",
    "quota_and_host_capacity_must_be_refreshed_immediately_before_the_official_window",
  ]) || record.zero_incremental_spend_only !== true || record.authorizes_official_window !== false || record.official_window_started !== false) {
    throw new Error("M2 resource risks or authorization boundaries are invalid");
  }
  return { status: "PASS", gate: "GRANT_M2_RESOURCE_REVALIDATION", plannedUnits: record.planned_units, alchemyUsedComputeUnits: quota.used_compute_units, alchemyRemainingComputeUnits: quota.remaining_compute_units, remainingAfterFrozenUpperComputeUnits: quota.remaining_after_frozen_upper_compute_units, minimumHostMemoryAvailableKb: Math.min(...Object.values(record.hosts).map(host => host.memory_available_kb)), projectedRemainingLamports: feePayer.projected_remaining_lamports, officialWindowStarted: false };
}

function parseJsonl(bytes, label, { allowEmpty = false } = {}) {
  const text = Buffer.from(bytes).toString("utf8");
  if (text.length === 0 && allowEmpty) return [];
  if (!text.endsWith("\n")) throw new Error(`${label} has a partial trailing record`);
  return text.trimEnd().split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`${label} contains invalid JSON at record ${index}`); }
  });
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function safeLabel(value) { return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{2,127}$/u.test(value); }
function canonicalTime(value) { if (typeof value !== "string" || new Date(value).toISOString() !== value) throw new Error("timestamp must be canonical UTC"); }
