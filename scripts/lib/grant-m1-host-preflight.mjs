export const GRANT_M1_HOST_PREFLIGHT_VERSION = "GrantM1HostPreflight@0.2.0";
export const GRANT_M1_OBSERVER_RUNTIME_MANIFEST_VERSION = "GrantM1ObserverRuntimeManifest@0.1.0";

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const NODE_VERSION = /^v[0-9]+\.[0-9]+\.[0-9]+$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]+$/u;

export function validateObserverRuntimeManifest(manifest) {
  if (!record(manifest) || manifest.schema_version !== GRANT_M1_OBSERVER_RUNTIME_MANIFEST_VERSION) throw new Error("Observer runtime manifest version is invalid");
  if (!COMMIT.test(manifest.source_commit)) throw new Error("Observer runtime source commit is invalid");
  if (!NODE_VERSION.test(`v${manifest.node_version}`)) throw new Error("Observer runtime manifest Node.js version is invalid");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error("Observer runtime manifest has no files");
  const paths = new Set();
  for (const entry of manifest.files) {
    if (!record(entry) || typeof entry.path !== "string" || !SAFE_PATH.test(entry.path) || entry.path.includes("\\") || !SHA256.test(entry.sha256)) throw new Error("Observer runtime manifest file entry is invalid");
    if (paths.has(entry.path)) throw new Error("Observer runtime manifest contains duplicate paths");
    paths.add(entry.path);
  }
  return manifest;
}

export function evaluateGrantM1HostPreflight(input) {
  if (!record(input)) throw new Error("host preflight input must be an object");
  if (!IDENTIFIER.test(input.observerId)) throw new Error("observerId is invalid");
  if (!isCanonicalTimestamp(input.capturedAt)) throw new Error("capturedAt must be a canonical ISO timestamp");
  if (!COMMIT.test(input.runtimeCommit) || input.runtimeCommit !== input.expectedRuntimeCommit) throw new Error("runtime commit does not match the frozen deployment commit");
  if (!NODE_VERSION.test(input.runtimeNodeVersion) || input.runtimeNodeVersion !== input.expectedNodeVersion) throw new Error("Node.js version does not match the frozen deployment runtime");
  if (!Number.isSafeInteger(input.manifestFileCount) || input.manifestFileCount < 1 || input.manifestFilesVerified !== input.manifestFileCount) throw new Error("Observer runtime manifest files were not fully verified");
  if (input.runtimeManifestVerified !== true || input.serviceUnitVerified !== true) throw new Error("Observer runtime or systemd unit integrity failed");
  if (input.clockSynchronized !== true) throw new Error("host clock is not synchronized");
  if (input.observerServiceActive !== true || input.observerServiceEnabled !== true) throw new Error("observer service is not active and enabled");
  if (input.loopbackBindingExclusive !== true) throw new Error("observer health port is not bound exclusively to loopback");
  if (!Number.isSafeInteger(input.freeBytes) || !Number.isSafeInteger(input.minimumFreeBytes) || input.minimumFreeBytes <= 0 || input.freeBytes < input.minimumFreeBytes) throw new Error("host does not meet the minimum free-disk requirement");
  const key = input.keyMetadata;
  if (!record(key) || key.isFile !== true || key.isSymbolicLink !== false) throw new Error("observer key must be a regular non-symlink file");
  if (key.ownerMatches !== true) throw new Error("observer key is not owned by the service account running preflight");
  if (key.mode !== 0o600) throw new Error("observer key permissions must be exactly 0600");
  const health = input.healthSnapshot;
  if (!record(health) || health.status !== "ready" || health.observerId !== input.observerId) throw new Error("observer readiness response is not ready or has the wrong identity");

  return {
    schema_version: GRANT_M1_HOST_PREFLIGHT_VERSION,
    observer_id: input.observerId,
    captured_at: input.capturedAt,
    ready: true,
    runtime_commit: input.runtimeCommit,
    node_version: input.runtimeNodeVersion,
    manifest_file_count: input.manifestFileCount,
    free_bytes: input.freeBytes,
    minimum_free_bytes: input.minimumFreeBytes,
    checks: {
      readiness_identity_match: true,
      clock_synchronized: true,
      key_regular_non_symlink: true,
      key_owner_matches_service_account: true,
      key_mode_0600: true,
      runtime_commit_matches: true,
      node_version_matches: true,
      runtime_manifest_verified: true,
      all_manifest_files_verified: true,
      systemd_unit_verified: true,
      observer_service_active: true,
      observer_service_enabled: true,
      loopback_binding_exclusive: true,
      disk_threshold_met: true
    }
  };
}

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
