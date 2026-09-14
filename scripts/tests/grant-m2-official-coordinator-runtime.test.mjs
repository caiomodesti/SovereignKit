import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  coordinatorSimplePortugueseSummary,
  createGrantM2OfficialInvalidEvent,
  createGrantM2OfficialMissingEvent,
  validateGrantM2OfficialCoordinatorConfig,
} from "../lib/grant-m2-official-coordinator-runtime.mjs";

const observer = observerId => ({
  observer_id: observerId,
  ssh_target: "operator@example.invalid",
  ssh_private_key_path: `/etc/sovereignkit/secrets/${observerId}.key`,
  known_hosts_path: `/etc/sovereignkit/secrets/${observerId}.known-hosts`,
  observer_private_key_path: "/etc/sovereignkit/secrets/observer-private.json",
  runtime_root: "/opt/sovereignkit-m2-rehearsal",
  inbox_root: "/var/lib/sovereignkit/m2/inbox",
  spool_root: "/var/lib/sovereignkit/spool",
  raw_root: "/var/lib/sovereignkit/evidence/m2/raw",
  completion_root: "/var/lib/sovereignkit/evidence/m2/completed",
  delivery_log_path: "/var/lib/sovereignkit/evidence/observer-delivery.jsonl",
});
const config = {
  schema_version: "GrantM2OfficialCoordinatorConfig@0.1.0", status: "CONFIGURED_NOT_STARTED", official_window_started: false,
  run_path: "/etc/sovereignkit/m2/run.json", quota_path: "/opt/sovereignkit-m2-coordinator/deploy/m2-resource-quota-estimate.json",
  run_directory: "/var/lib/sovereignkit/m2/official/run", journal_directory: "/var/lib/sovereignkit/m2/official/journal",
  evidence_directory: "/var/lib/sovereignkit/m2/official/evidence", observer_keys_path: "/etc/sovereignkit/m2/observer-keys.json",
  fee_payer_path: "/etc/sovereignkit/secrets/fee-payer.json", assignment_authority_private_path: "/etc/sovereignkit/secrets/authority-private.json",
  assignment_authority_public_path: "/etc/sovereignkit/m2/authority-public.json", alchemy_endpoint_path: "/etc/sovereignkit/secrets/alchemy.txt",
  public_endpoint_path: "/etc/sovereignkit/m2/public.txt", observer_allowlist_path: "/etc/sovereignkit/m2/observers.json",
  assignment_authorities_path: "/etc/sovereignkit/m2/authorities.json", probe_result_schema_path: "/opt/sovereignkit-m2-coordinator/spec/probe-result.schema.json",
  collector_accepted_log_path: "/var/lib/sovereignkit/evidence/accepted.jsonl",
  telegram_path: "/etc/sovereignkit/secrets/telegram.json",
  observers: [observer("observer-aws-a"), observer("observer-google-e2-micro"), observer("observer-oracle-a1")],
};

test("coordinator config binds all three transports and remains not started", () => {
  assert.equal(validateGrantM2OfficialCoordinatorConfig(config), true);
  assert.throws(() => validateGrantM2OfficialCoordinatorConfig({ ...config, official_window_started: true }), /envelope/u);
  assert.throws(() => validateGrantM2OfficialCoordinatorConfig({ ...config, observers: config.observers.slice(1) }), /envelope/u);
});

test("terminal helpers preserve no-backfill and explicit invalid accounting", () => {
  const slot = { slot_id: "a".repeat(64), cycle_index: 1, observer_id: "observer-aws-a", route_id: "alchemy-solana-devnet" };
  const at = "2026-09-14T04:12:00.001Z";
  assert.deepEqual(createGrantM2OfficialMissingEvent(slot, at), {
    event: "SLOT_TERMINAL", recorded_at: at, slot_id: slot.slot_id, cycle_index: 1, observer_id: slot.observer_id,
    route_id: slot.route_id, qualifying_units: 0, terminal_status: "MISSING", result_id: null, reason: "MISSED_WITHOUT_BACKFILL",
  });
  assert.equal(createGrantM2OfficialInvalidEvent(slot, at, "SEMANTIC_RECONCILIATION_FAILED").terminal_status, "INVALID");
});

test("Telegram summary is simple Portuguese and does not claim acceptance", () => {
  const text = coordinatorSimplePortugueseSummary({
    headline: "SovereignKit M2: resumo do dia 1 de 14.",
    state: { counts: { QUALIFYING: 10, REJECTED: 1, MISSING: 2, INVALID: 3 } },
    run: { schedule: { planned_units: 4_032 } },
  });
  assert.match(text, /10 válidas/u); assert.match(text, /2 perdidas/u); assert.match(text, /4 com problema/u); assert.match(text, /4016 ainda pendentes/u);
  assert.doesNotMatch(text, /aceito|concluído com sucesso/iu);
});

test("systemd coordinator restarts durably and enforces one flock writer without activating in installer", async () => {
  const unit = await readFile("deploy/grant-pilot/systemd/sovereignkit-m2-official-coordinator.service", "utf8");
  const installer = await readFile("scripts/install-grant-m2-official-coordinator.sh", "utf8");
  const runtime = await readFile("scripts/run-grant-m2-official-coordinator.mjs", "utf8");
  const transportProbe = await readFile("scripts/run-grant-m2-official-transport-probe.mjs", "utf8");
  const stager = await readFile("scripts/stage-grant-m2-official-coordinator-runtime.mjs", "utf8");
  const helpers = await readFile("scripts/lib/grant-m2-official-coordinator-runtime.mjs", "utf8");
  assert.match(unit, /Restart=on-failure/u); assert.match(unit, /\/usr\/bin\/flock --nonblock/u); assert.match(unit, /WantedBy=multi-user\.target/u);
  assert.match(unit, /\/usr\/local\/bin\/node scripts\/run-grant-m2-official-coordinator\.mjs/u);
  assert.match(installer, /manifest_commit=\$\(\/usr\/local\/bin\/node -e/u);
  assert.doesNotMatch(installer, /manifest_commit=\$\(node -e/u);
  assert.doesNotMatch(installer, /systemctl (?:enable|start) sovereignkit-m2-official-coordinator/u);
  assert.ok(runtime.indexOf("transportReserved") < runtime.indexOf("transportAssignment(observer"));
  assert.ok(runtime.indexOf('await runScp(observer, paths.entry, remoteEntry)') < runtime.indexOf('"/usr/bin/chown", "sovereignkit:sovereignkit"'));
  assert.ok(runtime.indexOf('"/usr/bin/chown", "sovereignkit:sovereignkit"') < runtime.indexOf('"/usr/bin/chmod", "0600"'));
  assert.ok(runtime.indexOf('"/usr/bin/chmod", "0600"') < runtime.indexOf('"/usr/bin/test", "-r", remoteEntry'));
  assert.ok(runtime.indexOf('"/usr/bin/test", "-r", remoteEntry') < runtime.indexOf('receive-grant-m2-assignment.mjs'));
  assert.match(transportProbe, /transaction_submitted: false/u);
  assert.match(transportProbe, /workers_started: 0/u);
  assert.match(transportProbe, /verifyAssignmentReceipt/u);
  assert.match(stager, /grant-m2-official-preflight\.mjs/u);
  assert.match(stager, /run-grant-m2-official-transport-probe\.mjs/u);
  assert.ok(runtime.indexOf("workerStartReserved") < runtime.indexOf("systemctl\", \"start"));
  assert.match(runtime, /createGrantM2OfficialMissingEvent/u); assert.match(helpers, /MISSED_WITHOUT_BACKFILL/u);
});
