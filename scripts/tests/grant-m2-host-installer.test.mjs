import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('M2 host installer is no-overwrite, no-secret and no-activation', async () => {
  const script = await readFile('scripts/install-grant-m2-host-runtime.sh', 'utf8');
  assert.match(script, /M2 host runtime already exists; reconciliation required/u);
  assert.match(script, /STAGED_HOST_PREPARATION_NOT_ACTIVATED/u);
  assert.match(script, /GRANT_M2_TOTAL_LIMIT=10000/u);
  assert.match(script, /workerInstances.*0/u);
  assert.doesNotMatch(script, /systemctl (?:enable|start)|privateKeyPkcs8Base64|bot_token/u);
  assert.match(script, /sovereignkit-m2-live-monitor\.timer/u);
  assert.match(script, /activated unexpectedly during install/u);
  assert.match(script, /systemctl is-active --quiet sovereignkit-observer\.service/u);
  assert.match(script, /import\("\.\/packages\/probes\/dist\/m2-rehearsal-submission\.js"\)/u);
});

test('M2 host upgrader is atomic, preserves a versioned backup and never activates workers', async () => {
  const script = await readFile('scripts/upgrade-grant-m2-host-runtime.sh', 'utf8');
  assert.match(script, /M2 worker instance exists before upgrade/u);
  assert.match(script, /backup-\$previous_commit/u);
  assert.match(script, /trap rollback EXIT/u);
  assert.match(script, /cmp --silent .*package-lock\.json/u);
  assert.match(script, /cp -a -- .*node_modules/u);
  assert.match(script, /UPGRADED_NOT_ACTIVATED/u);
  assert.match(script, /workerInstances.*0/u);
  assert.doesNotMatch(script, /systemctl (?:enable|start)|privateKeyPkcs8Base64|bot_token/u);
  assert.match(script, /activated unexpectedly during upgrade/u);
  assert.match(script, /evidence\/m2\/alerts/u);
});

test('live monitor activation proves one sample and cannot activate an observation worker', async () => {
  const script = await readFile('scripts/activate-grant-m2-live-monitor.sh', 'utf8');
  assert.match(script, /systemctl start "\$service"/u);
  assert.match(script, /systemctl enable --now "\$timer"/u);
  assert.match(script, /workerInstances.*0/u);
  assert.match(script, /officialWindowStarted.*false/u);
  assert.match(script, /installed runtime commit mismatch/u);
  assert.doesNotMatch(script, /observation-worker@.*start|bot_token|privateKeyPkcs8Base64/u);
});
