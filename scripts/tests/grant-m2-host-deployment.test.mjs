import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('host deployment verifies one package and preserves the no-activation boundary', async () => {
  const script = await readFile('scripts/deploy-grant-m2-host-runtime.ps1', 'utf8');
  assert.match(script, /Get-FileHash \$ArchivePath -Algorithm SHA256/u);
  assert.match(script, /observer-aws-a','observer-google-e2-micro','observer-oracle-a1/u);
  assert.match(script, /INSTALLED_THREE_HOSTS_NOT_ACTIVATED/u);
  assert.match(script, /workerInstances=0/u);
  assert.doesNotMatch(script, /systemctl (?:start|enable)|--retries/u);
});
