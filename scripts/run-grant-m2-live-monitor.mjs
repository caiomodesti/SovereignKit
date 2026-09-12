import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, open, readFile, readdir, rename, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { computeBacklog, parseClockOffsetMs, parseMemAvailableBytes, quotaRemainingPercent } from './lib/grant-m2-host-monitor-runtime.mjs';
import { decideGrantM2LiveMonitorNotification, evaluateGrantM2LiveMonitor, formatGrantM2LiveMonitorMessage, validateGrantM2LiveMonitorPolicy } from './lib/grant-m2-live-monitor.mjs';

const execFile = promisify(execFileCallback);
const [policyText, baselineText, observerId, stateText, journalText, telegramText] = process.argv.slice(2);
if ([policyText, baselineText, observerId, stateText, journalText].some(value => value === undefined) || process.argv.length > 8) {
  throw Error('usage: run-grant-m2-live-monitor <policy> <baseline-policy> <observer-id> <state> <journal> [telegram-config]');
}
const [policyContent, baselineContent] = await Promise.all([readFile(resolve(policyText), 'utf8'), readFile(resolve(baselineText), 'utf8')]);
const policy = JSON.parse(policyContent);
validateGrantM2LiveMonitorPolicy(policy, baselineContent);
const statePath = resolve(stateText); const journalPath = resolve(journalText);
const previous = await readPrevious(statePath);
const sampledAt = new Date().toISOString();
const sample = await collectSample(observerId, sampledAt, previous);
if (process.env.GRANT_M2_SYNTHETIC_ALERT === 'MEMORY_CRITICAL') sample.memory_available_bytes = 1;
const evaluation = evaluateGrantM2LiveMonitor(policy, sample);
const decision = decideGrantM2LiveMonitorNotification(policy, previous?.evaluation, evaluation);
let notification = { attempted: false, delivered: false, kind: decision.kind };
if (decision.send) {
  if (telegramText === undefined) throw Error('Telegram configuration is required for an alert transition');
  try {
    await sendTelegram(resolve(telegramText), formatGrantM2LiveMonitorMessage(evaluation, decision.kind));
    notification = { attempted: true, delivered: true, kind: decision.kind };
    evaluation.notification_sent_at = sampledAt;
    evaluation.notification_pending = false;
  } catch (error) {
    notification = { attempted: true, delivered: false, kind: decision.kind, error_class: error?.constructor?.name ?? 'Error' };
    evaluation.notification_pending = true;
  }
} else if (previous?.evaluation?.notification_sent_at !== undefined) {
  evaluation.notification_sent_at = previous.evaluation.notification_sent_at;
  evaluation.notification_pending = false;
}
const sequence = (previous?.sequence ?? 0) + 1;
const record = { schema_version: 'GrantM2LiveMonitorJournal@0.1.0', sequence, recorded_at: sampledAt, sample, evaluation, notification, official_window_started: false };
await appendSynced(journalPath, `${JSON.stringify(record)}\n`);
await writeState(statePath, { schema_version: 'GrantM2LiveMonitorState@0.1.0', sequence, evaluation, official_window_started: false });
process.stdout.write(`${JSON.stringify({ status: 'SAMPLED', observerId, sequence, highestSeverity: evaluation.highest_severity, notificationDelivered: notification.delivered, officialWindowStarted: false })}\n`);
if (evaluation.notification_pending === true) throw Error('Telegram alert delivery remains pending');

async function collectSample(id, at, prior) {
  const nowMs = Date.parse(at);
  const [meminfo, disk, active, ntp, offset, assignments, completions, quotaTexts] = await Promise.all([
    readFile('/proc/meminfo', 'utf8'),
    statFilesystem('/var/lib/sovereignkit'),
    command('systemctl', ['show', '--property=ActiveState', '--value', 'sovereignkit-observer.service']),
    command('timedatectl', ['show', '--property=NTPSynchronized', '--value']),
    collectClockOffset(),
    listAssignments('/var/lib/sovereignkit/m2/inbox'),
    listCompletions('/var/lib/sovereignkit/evidence/m2/completed'),
    readQuotaJournals('/var/lib/sovereignkit/m2/quota'),
  ]);
  const serviceActive = active.trim() === 'active'; const ntpSynchronized = ntp.trim() === 'yes';
  const previousFailures = prior?.evaluation?.sample?.consecutive_service_or_ntp_failures ?? prior?.sample?.consecutive_service_or_ntp_failures ?? 0;
  const backlog = computeBacklog(assignments, completions, nowMs);
  return { sampled_at: at, observer_id: id, memory_available_bytes: parseMemAvailableBytes(meminfo), disk_free_bytes: disk,
    clock_absolute_offset_ms: parseClockOffsetMs(offset), service_active: serviceActive, ntp_synchronized: ntpSynchronized,
    consecutive_service_or_ntp_failures: serviceActive && ntpSynchronized ? 0 : previousFailures + 1,
    delivery_backlog_count: backlog.count, oldest_delivery_age_seconds: backlog.oldestAgeSeconds,
    local_rpc_quota_remaining_percent: quotaRemainingPercent(quotaTexts) };
}

async function command(file, args) { const { stdout } = await execFile(file, args, { encoding: 'utf8', timeout: 10000 }); return stdout; }
async function collectClockOffset() {
  try { return await command('timedatectl', ['timesync-status']); }
  catch (systemdError) {
    try { return await command('chronyc', ['tracking']); }
    catch (chronyError) { throw new AggregateError([systemdError, chronyError], 'clock offset is unavailable from systemd-timesyncd and Chrony'); }
  }
}
async function statFilesystem(path) { const value = await import('node:fs/promises').then(module => module.statfs(path, { bigint: true })); return Number(value.bavail * value.bsize); }
async function listAssignments(path) { return Promise.all((await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(async entry => ({ id: entry.name, mtimeMs: Math.floor((await stat(join(path, entry.name))).mtimeMs) }))); }
async function listCompletions(path) { return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name.slice(0, -5)); }
async function readQuotaJournals(path) { const entries = await readdir(path, { withFileTypes: true }); return Promise.all(entries.filter(entry => entry.isFile() && entry.name.endsWith('.jsonl')).map(entry => readFile(join(path, entry.name), 'utf8'))); }
async function readPrevious(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return undefined; throw error; } }
async function appendSynced(path, text) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const handle = await open(path, 'a', 0o600); try { await handle.appendFile(text, 'utf8'); await handle.sync(); } finally { await handle.close(); } }
async function writeState(path, value) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const temporary = `${path}.${process.pid}.tmp`; const handle = await open(temporary, 'wx', 0o600); try { await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8'); await handle.sync(); } finally { await handle.close(); } await rename(temporary, path); }
async function sendTelegram(path, text) { const config = JSON.parse(await readFile(path, 'utf8')); if (typeof config.bot_token !== 'string' || config.bot_token.length < 20 || !/^-?\d+$/u.test(String(config.chat_id))) throw Error('Telegram configuration is invalid'); const response = await fetch(`https://api.telegram.org/bot${config.bot_token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: config.chat_id, text }), signal: AbortSignal.timeout(15000) }); const body = await response.json(); if (!response.ok || body?.ok !== true) throw Error('Telegram delivery was not accepted'); }
