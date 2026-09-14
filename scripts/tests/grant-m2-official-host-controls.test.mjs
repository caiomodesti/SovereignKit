import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("official worker uses an isolated quota journal and remains a non-enabled oneshot template", async () => {
  const unit = await readFile("deploy/grant-pilot/systemd/sovereignkit-m2-official-observation-worker@.service", "utf8");
  assert.match(unit, /Type=oneshot/u);
  assert.match(unit, /\/m2\/official-quota/u);
  assert.match(unit, /GRANT_M2_OFFICIAL_TOTAL_LIMIT/u);
  assert.doesNotMatch(unit, /WantedBy|Restart=/u);
});

test("official host controls install fail-closed without activating a worker", async () => {
  const script = await readFile("scripts/install-grant-m2-official-host-controls.sh", "utf8");
  assert.match(script, /GRANT_M2_OFFICIAL_TOTAL_LIMIT=1500000/u);
  assert.match(script, /official host controls already exist; reconciliation required/u);
  assert.match(script, /OFFICIAL_CONTROLS_INSTALLED_NOT_ACTIVATED/u);
  assert.match(script, /officialWindowStarted.*false/u);
  assert.doesNotMatch(script, /systemctl start|systemctl enable/u);
});
