import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, open, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { appendGrantM2OfficialEvent, initializeGrantM2OfficialJournal, loadGrantM2OfficialJournal } from "./lib/grant-m2-official-journal.mjs";
import { planGrantM2OfficialCoordinator } from "./lib/grant-m2-official-coordinator.mjs";
import {
  canonicalCoordinatorTimestamp,
  coordinatorSimplePortugueseSummary,
  createGrantM2OfficialEndEvent,
  createGrantM2OfficialInvalidEvent,
  createGrantM2OfficialMissingEvent,
  loadGrantM2OfficialCoordinatorConfig,
} from "./lib/grant-m2-official-coordinator-runtime.mjs";
import { validateGrantM2OfficialRun } from "./lib/grant-m2-official-run.mjs";

const config = await loadGrantM2OfficialCoordinatorConfig(requiredArgument("--config"));
const run = await readJson(config.run_path);
const quota = await readJson(config.quota_path);
validateGrantM2OfficialRun(run, quota);
await ensureDirectories();
await initializeGrantM2OfficialJournal({ directory: config.journal_directory, run, quota });

let lastDailySummary = -1;
try {
  while (true) {
    let state = await loadGrantM2OfficialJournal({ directory: config.journal_directory, run, quota });
    if (state.ended) break;
    await reconcilePreparedSlots(state);
    state = await loadGrantM2OfficialJournal({ directory: config.journal_directory, run, quota });
    const active = await activeAssignments(state);
    const nowAt = canonicalCoordinatorTimestamp();
    const plan = planGrantM2OfficialCoordinator({ run, quota, records: state.records, nowAt, activeAssignments: active });
    if (plan.status === "BLOCKED_START_MISSED") throw new Error("M2_OFFICIAL_START_TOLERANCE_MISSED");
    let acted = false;
    for (const action of plan.actions) {
      if (action.type === "START_WINDOW") {
        state = await appendGrantM2OfficialEvent({ directory: config.journal_directory, run, quota, event: {
          event: "WINDOW_STARTED", recorded_at: nowAt, run_id: run.run_id,
          preflight_sha256: run.authorization.preflight_sha256,
          official_window_started: true, milestone_2_started: true,
        } });
        await notifyBestEffort(coordinatorSimplePortugueseSummary({ state, run, headline: "SovereignKit M2: a janela oficial de 14 dias começou." }));
        acted = true;
      } else if (action.type === "RECORD_MISSING") {
        const priorProblems = state.counts.MISSING + state.counts.INVALID + state.counts.REJECTED;
        state = await appendGrantM2OfficialEvent({ directory: config.journal_directory, run, quota, event: createGrantM2OfficialMissingEvent(action.slot, nowAt) });
        if (priorProblems === 0) await notifyBestEffort(coordinatorSimplePortugueseSummary({ state, run, headline: "SovereignKit M2: atenção, ocorreu o primeiro slot perdido. O coordenador não fará backfill." }));
        acted = true;
      } else if (action.type === "EXECUTE_SLOT") {
        await prepareSlot(action.slot, nowAt);
        acted = true;
      } else if (action.type === "END_WINDOW") {
        state = await loadGrantM2OfficialJournal({ directory: config.journal_directory, run, quota });
        state = await appendGrantM2OfficialEvent({ directory: config.journal_directory, run, quota, event: createGrantM2OfficialEndEvent(run, state, nowAt) });
        await notifyBestEffort(coordinatorSimplePortugueseSummary({ state, run, headline: "SovereignKit M2: a janela oficial de 14 dias terminou. A aceitação ainda depende da auditoria final." }));
        acted = true;
      }
    }
    state = await loadGrantM2OfficialJournal({ directory: config.journal_directory, run, quota });
    if (state.ended) break;
    await advanceActiveAssignments(state);
    await maybeSendDailySummary(state);
    if (!acted) await sleep(nextDelay(plan.next_wake_at));
  }
} catch (error) {
  await notifyBestEffort(`SovereignKit M2: o coordenador parou em modo seguro. Nenhuma repetição automática será feita. Motivo técnico: ${errorClass(error)}.`);
  throw error;
}

async function reconcilePreparedSlots(state) {
  for (const slot of run.schedule.slots) {
    if (state.terminalSlotIds.has(slot.slot_id)) continue;
    if (Date.parse(slot.due_at) > Date.now()) continue;
    const paths = localSlotPaths(slot.slot_id);
    if (await exists(paths.entry)) continue;
    const recovered = join(config.run_directory, "slot-side-effects", slot.slot_id, "03-assignment-prepared.json");
    if (await exists(recovered)) {
      const record = await readJson(recovered);
      if (record?.state !== "ASSIGNMENT_PREPARED" || record?.slot_id !== slot.slot_id || record?.evidence?.entry?.slot_id !== slot.slot_id) {
        await markInvalid(slot, "PREPARED_ASSIGNMENT_RECOVERY_INVALID");
      } else {
        await writeOnce(paths.entry, `${JSON.stringify(record.evidence.entry)}\n`);
      }
      continue;
    }
    const sideEffects = join(config.run_directory, "slot-side-effects", slot.slot_id);
    if (await exists(sideEffects)) await markInvalid(slot, "TRANSACTION_SIDE_EFFECT_RECONCILIATION_REQUIRED");
  }
}

async function prepareSlot(slot, nowAt) {
  const paths = localSlotPaths(slot.slot_id);
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  if (!(await exists(paths.entry))) {
    const result = await runProcess(process.execPath, [
      resolve("scripts/run-grant-m2-official-slot.mjs"),
      "--run", config.run_path, "--quota", config.quota_path, "--slot-id", slot.slot_id,
      "--observer-keys", config.observer_keys_path, "--fee-payer", config.fee_payer_path,
      "--assignment-authority", config.assignment_authority_private_path,
      "--alchemy-endpoint-file", config.alchemy_endpoint_path, "--public-endpoint-file", config.public_endpoint_path,
      "--run-directory", config.run_directory, "--now-at", nowAt, "--output", paths.entry,
    ]);
    const output = lastJson(result.stdout);
    if (result.code !== 0 || output?.status !== "ASSIGNMENT_PREPARED") {
      await markInvalid(slot, "TRANSACTION_SUBMISSION_RECONCILIATION_REQUIRED");
      return;
    }
  }
  await advanceOne(slot);
}

async function activeAssignments(state) {
  const result = [];
  const root = join(config.run_directory, "slots");
  for (const name of await safeReadDirectory(root)) {
    const entryPath = join(root, name, "prepared-dispatch.json");
    if (!(await exists(entryPath)) || state.terminalSlotIds.has(name)) continue;
    const entry = await readJson(entryPath);
    const slot = run.schedule.slots.find(candidate => candidate.slot_id === name);
    if (!slot || entry?.assignment?.job?.observerId !== slot.observer_id || entry?.assignment?.assignmentId === undefined) {
      throw new Error("M2_OFFICIAL_ACTIVE_ASSIGNMENT_INVALID");
    }
    result.push({ slot_id: name, observer_id: slot.observer_id, assignment_id: entry.assignment.assignmentId });
  }
  return result;
}

async function advanceActiveAssignments(state) {
  for (const active of await activeAssignments(state)) {
    const slot = run.schedule.slots.find(candidate => candidate.slot_id === active.slot_id);
    await advanceOne(slot);
  }
}

async function advanceOne(slot) {
  const paths = localSlotPaths(slot.slot_id);
  const entry = await readJson(paths.entry);
  const assignmentId = entry.assignment.assignmentId;
  const observer = config.observers.find(candidate => candidate.observer_id === slot.observer_id);
  const expiresAt = Date.parse(entry.assignment.expiresAt);
  if (!(await exists(paths.receipt))) {
    if (!(await exists(paths.transportReserved))) {
      await writeState(paths.transportReserved, slot, assignmentId, "TRANSPORT_RESERVED");
      try {
        await transportAssignment(observer, entry, paths);
        await writeState(paths.transportCompleted, slot, assignmentId, "TRANSPORT_COMPLETED");
      } catch (error) {
        await writeState(paths.transportReconciliation, slot, assignmentId, "TRANSPORT_RECONCILIATION_REQUIRED", errorClass(error));
      }
    }
    const remoteReceipt = `${observer.inbox_root}/${assignmentId}/receipt.json`;
    if (await remoteExists(observer, remoteReceipt)) await writeOnce(paths.receipt, await readRemote(observer, remoteReceipt));
    else if (Date.now() > expiresAt) { await markInvalid(slot, "ASSIGNMENT_RECEIPT_NOT_OBSERVED"); return; }
    else return;
  }
  if (!(await exists(paths.workerStartReserved))) {
    await writeState(paths.workerStartReserved, slot, assignmentId, "WORKER_START_RESERVED");
    try {
      await runSsh(observer, ["sudo", "/usr/bin/systemctl", "start", "--no-block", `sovereignkit-m2-official-observation-worker@${assignmentId}.service`]);
      await writeState(paths.workerStarted, slot, assignmentId, "WORKER_START_ACKNOWLEDGED");
    } catch (error) {
      await writeState(paths.workerReconciliation, slot, assignmentId, "WORKER_START_RECONCILIATION_REQUIRED", errorClass(error));
    }
  }
  const remoteCompletion = `${observer.completion_root}/${assignmentId}.json`;
  if (!(await remoteExists(observer, remoteCompletion))) {
    if (Date.now() > expiresAt) await markInvalid(slot, "WORKER_COMPLETION_NOT_OBSERVED");
    return;
  }
  await writeRemoteEvidence(observer, assignmentId, paths);
  const deliveryLog = await readFile(paths.deliveryLog, "utf8");
  const resultId = entry.assignment.job.resultId;
  if (!deliveryLog.trimEnd().split("\n").some(line => safeJson(line)?.result_id === resultId)) {
    if (Date.now() > expiresAt) await markInvalid(slot, "COLLECTOR_ACCEPTANCE_NOT_OBSERVED");
    return;
  }
  const completed = await runProcess(process.execPath, [
    resolve("scripts/complete-grant-m2-official-slot.mjs"), "--run", config.run_path, "--quota", config.quota_path,
    "--entry", paths.entry, "--completion", paths.completion, "--unsigned-result", paths.unsigned,
    "--raw", paths.raw, "--delivery-log", paths.deliveryLog, "--observer-allowlist", config.observer_allowlist_path,
    "--collector-log", config.collector_accepted_log_path,
    "--assignment-authorities", config.assignment_authorities_path, "--probe-result-schema", config.probe_result_schema_path,
    "--slot-id", slot.slot_id, "--journal-directory", config.journal_directory,
    "--evidence-directory", config.evidence_directory, "--recorded-at", canonicalCoordinatorTimestamp(),
  ]);
  if (completed.code !== 0 || lastJson(completed.stdout)?.status !== "QUALIFYING") {
    await markInvalid(slot, "SEMANTIC_RECONCILIATION_FAILED");
  }
}

async function transportAssignment(observer, entry, paths) {
  const assignmentId = entry.assignment.assignmentId;
  const remoteEntry = `/tmp/sovereignkit-m2-${assignmentId}.json`;
  const remoteAuthority = `/tmp/sovereignkit-m2-authority-${assignmentId}.json`;
  await runScp(observer, paths.entry, remoteEntry);
  await runScp(observer, config.assignment_authority_public_path, remoteAuthority);
  await runSsh(observer, ["sudo", "/usr/bin/chown", "sovereignkit:sovereignkit", "--", remoteEntry, remoteAuthority]);
  await runSsh(observer, ["sudo", "/usr/bin/chmod", "0600", "--", remoteEntry, remoteAuthority]);
  await runSsh(observer, ["sudo", "-u", "sovereignkit", "/usr/bin/test", "-r", remoteEntry, "-a", "-r", remoteAuthority]);
  const receivedAt = canonicalCoordinatorTimestamp();
  const output = await runSsh(observer, [
    "sudo", "-u", "sovereignkit", "/usr/bin/node", `${observer.runtime_root}/scripts/receive-grant-m2-assignment.mjs`,
    remoteEntry, remoteAuthority, observer.observer_private_key_path, observer.inbox_root, receivedAt,
  ]);
  const received = lastJson(output.stdout);
  if (received?.status !== "RECEIVED" && received?.status !== "RECONCILIATION_REQUIRED") throw new Error("M2_ASSIGNMENT_RECEIPT_REJECTED");
  await runSsh(observer, ["sudo", "/usr/bin/rm", "-f", remoteEntry, remoteAuthority]).catch(() => {});
}

async function writeRemoteEvidence(observer, assignmentId, paths) {
  const sources = [
    [paths.completion, `${observer.completion_root}/${assignmentId}.json`],
    [paths.unsigned, `${observer.spool_root}/m2-${assignmentId}.json`],
    [paths.raw, `${observer.raw_root}/${assignmentId}.jsonl`],
    [paths.deliveryLog, observer.delivery_log_path],
  ];
  for (const [local, remote] of sources) {
    const contents = await readRemote(observer, remote);
    if (local === paths.deliveryLog) await replaceFile(local, contents);
    else await writeOnce(local, contents);
  }
}

async function markInvalid(slot, reason) {
  const state = await loadGrantM2OfficialJournal({ directory: config.journal_directory, run, quota });
  if (state.terminalSlotIds.has(slot.slot_id)) return;
  const priorProblems = state.counts.MISSING + state.counts.INVALID + state.counts.REJECTED;
  const next = await appendGrantM2OfficialEvent({ directory: config.journal_directory, run, quota, event: createGrantM2OfficialInvalidEvent(slot, canonicalCoordinatorTimestamp(), reason) });
  if (priorProblems === 0) await notifyBestEffort(coordinatorSimplePortugueseSummary({ state: next, run, headline: "SovereignKit M2: atenção, ocorreu o primeiro slot com problema. A transação não será repetida automaticamente." }));
}

async function maybeSendDailySummary(state) {
  if (!state.started) return;
  const day = Math.floor((Date.now() - Date.parse(run.schedule.start_at)) / 86_400_000);
  if (day <= 0 || day === lastDailySummary) return;
  const marker = join(config.run_directory, "notifications", `day-${String(day).padStart(2, "0")}.json`);
  if (await exists(marker)) { lastDailySummary = day; return; }
  await notifyBestEffort(coordinatorSimplePortugueseSummary({ state, run, headline: `SovereignKit M2: resumo do dia ${day} de 14.` }));
  await writeOnce(marker, `${JSON.stringify({ day, recorded_at: canonicalCoordinatorTimestamp() })}\n`);
  lastDailySummary = day;
}

async function notify(text) {
  const telegram = await readJson(config.telegram_path);
  if (typeof telegram.bot_token !== "string" || telegram.bot_token.length < 20 || !/^-?\d+$/u.test(String(telegram.chat_id))) throw new Error("M2_TELEGRAM_CONFIG_INVALID");
  const response = await fetch(`https://api.telegram.org/bot${telegram.bot_token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: telegram.chat_id, text }), signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (!response.ok || body?.ok !== true) throw new Error("M2_TELEGRAM_DELIVERY_REJECTED");
}

async function notifyBestEffort(text) {
  try { await notify(text); }
  catch (error) {
    const directory = join(config.run_directory, "notification-failures");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, `${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    await writeOnce(path, `${JSON.stringify({ recorded_at: canonicalCoordinatorTimestamp(), error_class: errorClass(error) })}\n`);
  }
}

function localSlotPaths(slotId) {
  const directory = join(config.run_directory, "slots", slotId);
  return {
    directory, entry: join(directory, "prepared-dispatch.json"), receipt: join(directory, "receipt.json"),
    transportReserved: join(directory, "transport-reserved.json"), transportCompleted: join(directory, "transport-completed.json"),
    workerStartReserved: join(directory, "worker-start-reserved.json"), workerStarted: join(directory, "worker-started.json"),
    transportReconciliation: join(directory, "transport-reconciliation-required.json"),
    workerReconciliation: join(directory, "worker-reconciliation-required.json"), completion: join(directory, "completion.json"),
    unsigned: join(directory, "unsigned-result.json"), raw: join(directory, "raw-observations.jsonl"), deliveryLog: join(directory, "observer-delivery.jsonl"),
  };
}

async function ensureDirectories() {
  for (const path of [config.run_directory, config.journal_directory, config.evidence_directory, join(config.run_directory, "slots"), join(config.run_directory, "notifications")]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
}
async function writeState(path, slot, assignmentId, state, error = undefined) {
  await writeOnce(path, `${JSON.stringify({ schema_version: "GrantM2OfficialCoordinatorState@0.1.0", state, slot_id: slot.slot_id, observer_id: slot.observer_id, assignment_id: assignmentId, recorded_at: canonicalCoordinatorTimestamp(), ...(error ? { error_class: error } : {}) })}\n`);
}
async function writeOnce(path, text) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { const handle = await open(path, "wx", 0o600); try { await handle.writeFile(text, "utf8"); await handle.sync(); } finally { await handle.close(); } }
  catch (error) { if (error?.code !== "EEXIST" || await readFile(path, "utf8") !== text) throw error; }
}
async function replaceFile(path, text) { const handle = await open(path, "w", 0o600); try { await handle.writeFile(text, "utf8"); await handle.sync(); } finally { await handle.close(); } }
async function readRemote(observer, path) {
  const result = await runSsh(observer, ["sudo", "/usr/bin/base64", "-w0", "--", path]);
  return Buffer.from(result.stdout.trim(), "base64").toString("utf8");
}
async function remoteExists(observer, path) { const result = await runSsh(observer, ["sudo", "/usr/bin/test", "-f", path], true); return result.code === 0; }
async function runScp(observer, local, remote) {
  const result = await runProcess("/usr/bin/scp", ["-q", "-i", observer.ssh_private_key_path, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1", "-o", `UserKnownHostsFile=${observer.known_hosts_path}`, "--", local, `${observer.ssh_target}:${remote}`]);
  if (result.code !== 0) throw new Error("M2_SCP_FAILED");
}
async function runSsh(observer, command, allowFailure = false) {
  const result = await runProcess("/usr/bin/ssh", ["-i", observer.ssh_private_key_path, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2", "-o", `UserKnownHostsFile=${observer.known_hosts_path}`, "--", observer.ssh_target, command.map(shellQuote).join(" ")]);
  if (!allowFailure && result.code !== 0) throw new Error("M2_SSH_COMMAND_FAILED");
  return result;
}
function runProcess(file, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > 33_554_432) child.kill(); });
    child.stderr.on("data", chunk => { stderr += chunk; if (stderr.length > 1_048_576) child.kill(); });
    child.once("error", reject); child.once("close", code => resolvePromise({ code, stdout, stderr }));
  });
}
function shellQuote(value) { if (typeof value !== "string" || value.includes("\0")) throw new Error("unsafe remote argument"); return `'${value.replaceAll("'", `'"'"'`)}'`; }
function lastJson(text) { const line = text.trimEnd().split("\n").at(-1); return safeJson(line); }
function safeJson(text) { try { return JSON.parse(text); } catch { return undefined; } }
async function readJson(path) { return JSON.parse(await readFile(resolve(path), "utf8")); }
async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }
async function safeReadDirectory(path) { try { return await readdir(path); } catch (error) { if (error?.code === "ENOENT") return []; throw error; } }
function sleep(ms) { return new Promise(resolvePromise => setTimeout(resolvePromise, ms)); }
function nextDelay(nextWakeAt) { if (!nextWakeAt) return 1_000; return Math.max(100, Math.min(1_000, Date.parse(nextWakeAt) - Date.now())); }
function errorClass(error) { return error instanceof Error && /^[A-Za-z][A-Za-z0-9_]*$/u.test(error.message) ? error.message : (error?.name ?? "UnknownError"); }
function requiredArgument(name) { const index = process.argv.indexOf(name); if (index < 0 || index + 1 >= process.argv.length) throw new Error(`${name} is required`); return process.argv[index + 1]; }
