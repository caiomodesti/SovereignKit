import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

test("staged official coordinator is credential-free and inactive", async () => {
  const output = `artifacts/grant-m2-official-coordinator-test-${process.pid}`;
  try {
    const staged = await run(process.execPath, ["scripts/stage-grant-m2-official-coordinator-runtime.mjs", output], { encoding: "utf8" });
    const manifest = JSON.parse(staged.stdout);
    assert.equal(manifest.status, "STAGED_NOT_CONFIGURED_NOT_ACTIVATED");
    const verified = await run(process.execPath, ["scripts/verify-grant-m2-official-coordinator-runtime.mjs", output], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(verified.stdout), {
      status: "PASS", gate: "GRANT_M2_OFFICIAL_COORDINATOR_RUNTIME", files: manifest.file_count,
      sourceCommit: manifest.source_commit, coordinatorConfigIncluded: false, activationPerformed: false, officialWindowStarted: false,
    });
  } finally { await rm(output, { recursive: true, force: true }); }
});
