import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);

test('staged M2 host runtime includes and verifies the inactive official controls', async () => {
  const output = `artifacts/grant-m2-host-runtime-test-${process.pid}`;
  try {
    const staged = await run(process.execPath, ['scripts/stage-grant-m2-rehearsal-runtime.mjs', '--host-preparation', output], { encoding: 'utf8' });
    const manifest = JSON.parse(staged.stdout);
    assert.equal(manifest.status, 'STAGED_HOST_PREPARATION_NOT_ACTIVATED');

    const verified = await run(process.execPath, ['scripts/verify-grant-m2-rehearsal-runtime.mjs', '--host-preparation', output], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(verified.stdout), {
      status: 'PASS',
      gate: 'GRANT_M2_HOST_PREPARATION_RUNTIME',
      files: manifest.file_count,
      sourceCommit: manifest.source_commit,
      containsActivationUnit: true,
      activationPerformed: false,
      rehearsalAuthorized: false,
      milestone2Started: false,
    });
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
