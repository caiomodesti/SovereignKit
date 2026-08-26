export const GRANT_M1_HOST_PREFLIGHT_VERSION = "GrantM1HostPreflight@0.1.0";

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const NODE_VERSION = /^v[0-9]+\.[0-9]+\.[0-9]+$/u;

export function evaluateGrantM1HostPreflight(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("host preflight input must be an object");
  if (!IDENTIFIER.test(input.observerId)) throw new Error("observerId is invalid");
  if (!isCanonicalTimestamp(input.capturedAt)) throw new Error("capturedAt must be a canonical ISO timestamp");
  if (!COMMIT.test(input.runtimeCommit) || !COMMIT.test(input.expectedRuntimeCommit)) throw new Error("runtime commit must be a lowercase 40-character Git SHA");
  if (input.runtimeCommit !== input.expectedRuntimeCommit) throw new Error("runtime commit does not match the frozen deployment commit");
  if (!NODE_VERSION.test(input.runtimeNodeVersion) || !NODE_VERSION.test(input.expectedNodeVersion) || input.runtimeNodeVersion !== input.expectedNodeVersion) {
    throw new Error("Node.js version does not match the frozen deployment runtime");
  }
  if (input.runtimeTreeClean !== true) throw new Error("runtime Git tree is not clean");
  if (input.clockSynchronized !== true) throw new Error("host clock is not synchronized");
  if (input.observerServiceActive !== true) throw new Error("observer service is not active");
  if (!Number.isSafeInteger(input.freeBytes) || !Number.isSafeInteger(input.minimumFreeBytes) || input.minimumFreeBytes <= 0 || input.freeBytes < input.minimumFreeBytes) {
    throw new Error("host does not meet the minimum free-disk requirement");
  }

  const key = input.keyMetadata;
  if (key === null || typeof key !== "object" || Array.isArray(key) || key.isFile !== true || key.isSymbolicLink !== false) {
    throw new Error("observer key must be a regular non-symlink file");
  }
  if (key.ownerMatches !== true) throw new Error("observer key is not owned by the service account running preflight");
  if (!Number.isSafeInteger(key.mode) || (key.mode & 0o077) !== 0) throw new Error("observer key permissions are unsafe; expected no group/other access");

  const health = input.healthSnapshot;
  if (health === null || typeof health !== "object" || Array.isArray(health) || health.status !== "ready" || health.observerId !== input.observerId) {
    throw new Error("observer readiness response is not ready or has the wrong identity");
  }

  return {
    schema_version: GRANT_M1_HOST_PREFLIGHT_VERSION,
    observer_id: input.observerId,
    captured_at: input.capturedAt,
    ready: true,
    clock_synchronized: true,
    key_permissions_verified: true,
    runtime_commit: input.runtimeCommit,
    runtime_commit_verified: true,
    node_version: input.runtimeNodeVersion,
    node_version_verified: true,
    runtime_tree_clean: true,
    observer_service_active: true,
    free_bytes: input.freeBytes,
    minimum_free_bytes: input.minimumFreeBytes,
    checks: {
      readiness_identity_match: true,
      clock_synchronized: true,
      key_regular_non_symlink: true,
      key_owner_matches_service_account: true,
      key_group_other_access_denied: true,
      runtime_commit_matches: true,
      node_version_matches: true,
      runtime_tree_clean: true,
      observer_service_active: true,
      disk_threshold_met: true,
    },
  };
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
