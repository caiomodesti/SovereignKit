import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const path = 'deploy/grant-pilot/systemd/sovereignkit-m2-observation-worker@.service';

test('M2 rehearsal unit is isolated, quota-bound and assignment-bound', async () => {
  const unit = await readFile(path, 'utf8');
  assert.match(unit, /^User=sovereignkit$/mu);
  assert.match(unit, /^WorkingDirectory=\/opt\/sovereignkit-m2-rehearsal$/mu);
  assert.match(unit, /^EnvironmentFile=\/etc\/sovereignkit\/m2-rehearsal\.env$/mu);
  assert.match(unit, /\/m2\/inbox\/%i\/assignment\.json/u);
  assert.match(unit, /\/spool\/m2-%i\.json/u);
  assert.match(unit, /\/evidence\/m2\/raw\/%i\.jsonl/u);
  assert.match(unit, /\/m2\/quota \$\{GRANT_M2_OBSERVER_ID\} \$\{GRANT_M2_TOTAL_LIMIT\} \/var\/lib\/sovereignkit\/evidence\/m2\/completed\/%i\.json$/mu);
  assert.match(unit, /^NoNewPrivileges=true$/mu);
  assert.match(unit, /^ProtectSystem=strict$/mu);
  assert.match(unit, /^UMask=0077$/mu);
  assert.doesNotMatch(unit, /bash|-c|curl|wget|Restart=/u);
});
