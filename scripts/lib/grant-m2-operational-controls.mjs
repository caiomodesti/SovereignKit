import { createHash } from "node:crypto";

export const GRANT_M2_BACKUP_MANIFEST_VERSION = "GrantM2BackupManifest@0.1.0";
export const GRANT_M2_DAILY_SUMMARY_VERSION = "GrantM2DailySummary@0.1.0";
export const GRANT_M2_INCIDENT_LOG_VERSION = "GrantM2IncidentLog@0.1.0";

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
