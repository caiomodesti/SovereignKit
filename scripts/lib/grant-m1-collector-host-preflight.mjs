export const GRANT_M1_COLLECTOR_HOST_PREFLIGHT_VERSION = "GrantM1CollectorHostPreflight@0.1.0";
export const GRANT_M1_COLLECTOR_RUNTIME_MANIFEST_VERSION = "GrantM1CollectorRuntimeManifest@0.1.0";

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const NODE_VERSION = /^v[0-9]+\.[0-9]+\.[0-9]+$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;

export function validateCollectorRuntimeManifest(manifest) {
  if (!record(manifest) || manifest.schema_version !== GRANT_M1_COLLECTOR_RUNTIME_MANIFEST_VERSION) {
    throw new Error("Collector runtime manifest version is invalid");
  }
  if (!COMMIT.test(manifest.source_commit)) throw new Error("Collector runtime source commit is invalid");
  if (!NODE_VERSION.test(`v${manifest.node_version}`)) throw new Error("Collector runtime manifest Node.js version is invalid");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error("Collector runtime manifest has no files");

  const paths = new Set();
  for (const entry of manifest.files) {
    if (!record(entry) || typeof entry.path !== "string" || !SAFE_PATH.test(entry.path) || entry.path.includes("\\") || !SHA256.test(entry.sha256)) {
      throw new Error("Collector runtime manifest file entry is invalid");
    }
    if (paths.has(entry.path)) throw new Error("Collector runtime manifest contains duplicate paths");
    paths.add(entry.path);
  }
  return manifest;
}

export function evaluateGrantM1CollectorHostPreflight(input) {
  if (!record(input)) throw new Error("Collector host preflight input must be an object");
  if (!IDENTIFIER.test(input.componentId)) throw new Error("componentId is invalid");
  if (!canonicalTimestamp(input.capturedAt)) throw new Error("capturedAt must be a canonical ISO timestamp");
  if (!COMMIT.test(input.runtimeCommit) || input.runtimeCommit !== input.expectedRuntimeCommit) {
    throw new Error("Collector runtime commit does not match the frozen deployment commit");
  }
  if (!NODE_VERSION.test(input.runtimeNodeVersion) || input.runtimeNodeVersion !== input.expectedNodeVersion) {
    throw new Error("Node.js version does not match the frozen Collector runtime");
  }
  if (!Number.isSafeInteger(input.manifestFileCount) || input.manifestFileCount < 1 || input.manifestFilesVerified !== input.manifestFileCount) {
    throw new Error("Collector runtime manifest files were not fully verified");
  }
  if (input.runtimeManifestVerified !== true || input.serviceUnitVerified !== true) throw new Error("Collector runtime or systemd unit integrity failed");
  if (input.clockSynchronized !== true) throw new Error("host clock is not synchronized");
  if (input.collectorServiceActive !== true || input.collectorServiceEnabled !== true) throw new Error("Collector service is not active and enabled");
  if (input.loopbackBindingExclusive !== true) throw new Error("Collector port is not bound exclusively to loopback");
  if (!Number.isSafeInteger(input.freeBytes) || !Number.isSafeInteger(input.minimumFreeBytes) || input.minimumFreeBytes <= 0 || input.freeBytes < input.minimumFreeBytes) {
    throw new Error("host does not meet the minimum free-disk requirement");
  }

  const evidence = input.evidenceMetadata;
  if (!record(evidence) || evidence.isFile !== true || evidence.isSymbolicLink !== false) throw new Error("Collector evidence log must be a regular non-symlink file");
  if (evidence.ownerMatches !== true) throw new Error("Collector evidence log is not owned by the service account");
  if (evidence.mode !== 0o600) throw new Error("Collector evidence log permissions must be exactly 0600");

  const health = input.healthSnapshot;
  if (!record(health) || health.status !== "ok" || !Number.isSafeInteger(health.storedCount) || health.storedCount < 0) {
    throw new Error("Collector health response is invalid");
  }

  return {
    schema_version: GRANT_M1_COLLECTOR_HOST_PREFLIGHT_VERSION,
    component_id: input.componentId,
    captured_at: input.capturedAt,
    ready: true,
    runtime_commit: input.runtimeCommit,
    node_version: input.runtimeNodeVersion,
    manifest_file_count: input.manifestFileCount,
    stored_count: health.storedCount,
    free_bytes: input.freeBytes,
    minimum_free_bytes: input.minimumFreeBytes,
    checks: {
      runtime_commit_matches: true,
      node_version_matches: true,
      runtime_manifest_verified: true,
      all_manifest_files_verified: true,
      systemd_unit_verified: true,
      clock_synchronized: true,
      collector_service_active: true,
      collector_service_enabled: true,
      health_status_ok: true,
      loopback_binding_exclusive: true,
      evidence_regular_non_symlink: true,
      evidence_owner_matches_service_account: true,
      evidence_mode_0600: true,
      disk_threshold_met: true,
    },
  };
}

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function canonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
