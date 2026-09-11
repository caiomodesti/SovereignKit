import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('live rehearsal orchestrator is bounded, fail-closed and does not start the official window', async () => {
  const script = await readFile('scripts/run-grant-m2-live-rehearsal.ps1', 'utf8');
  assert.match(script, /foreach \(\$slot in \$run\.schedule\.slots\)/u);
  assert.match(script, /REHEARSAL_STOPPED_FAIL_CLOSED/u);
  assert.match(script, /Não haverá retry automático/u);
  assert.match(script, /qualifying_units=0/u);
  assert.match(script, /elapsed_seconds=3600/u);
  assert.match(script, /yyyy-MM-ddTHH:mm:ss\.fffZ/u);
  assert.match(script, /ConvertFrom-Json -DateKind String/u);
  assert.doesNotMatch(script, /\[int\]\$remaining/u);
  assert.match(script, /official_window_started=\$false/u);
  assert.match(script, /systemctl start --no-block/u);
  assert.match(script, /Complete-PendingSlot/u);
  assert.match(script, /Worker completion deadline exceeded before another transaction/u);
  assert.doesNotMatch(script, /requestAirdrop|--retries|Start-Job/u);
});
