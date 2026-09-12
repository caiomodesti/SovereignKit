export function parseMemAvailableBytes(text) {
  const match = /^MemAvailable:\s+(\d+)\s+kB$/mu.exec(text);
  if (match === null) throw Error('MemAvailable is unavailable');
  return Number(match[1]) * 1024;
}

export function parseClockOffsetMs(text) {
  const chrony = /^System time\s*:\s*(\d+(?:\.\d+)?)\s+seconds\s+(?:fast|slow)\s+of\s+NTP\s+time$/imu.exec(text);
  if (chrony !== null) return Number(chrony[1]) * 1000;
  const normalized = text.includes('Offset:') ? text.match(/^\s*Offset:\s+([^\r\n]+)$/mu)?.[1] ?? '' : text.trim();
  const match = /^([+-]?)(\d+(?:\.\d+)?)\s*(us|ms|s)$/u.exec(normalized);
  if (match === null) throw Error('clock offset is unavailable');
  const scale = match[3] === 'us' ? 0.001 : match[3] === 'ms' ? 1 : 1000;
  return Math.abs(Number(match[2]) * scale);
}

export function quotaRemainingPercent(journalTexts) {
  if (!Array.isArray(journalTexts) || journalTexts.length === 0) return 100;
  let spent = 0; let total = 0;
  for (const text of journalTexts) {
    if (typeof text !== 'string' || !text.endsWith('\n')) throw Error('RPC quota journal is partial');
    const lines = text.trimEnd().split('\n');
    const record = JSON.parse(lines.at(-1));
    if (record?.schema_version !== 'GrantM2RpcBudgetJournal@0.1.0' || !Number.isSafeInteger(record.total_limit) ||
        !Number.isSafeInteger(record.state?.spent) || record.state.spent < 0 || record.state.spent > record.total_limit) throw Error('RPC quota journal is invalid');
    spent += record.state.spent; total += record.total_limit;
  }
  return total === 0 ? 100 : Math.max(0, (total - spent) * 100 / total);
}

export function computeBacklog(assignments, completions, nowMs) {
  if (!Array.isArray(assignments) || !Array.isArray(completions) || !Number.isSafeInteger(nowMs) || nowMs < 0) throw Error('backlog input is invalid');
  const completed = new Set(completions);
  const pending = assignments.filter(entry => !completed.has(entry.id));
  if (pending.some(entry => typeof entry.id !== 'string' || !Number.isSafeInteger(entry.mtimeMs) || entry.mtimeMs < 0 || entry.mtimeMs > nowMs)) throw Error('backlog assignment is invalid');
  return { count: pending.length, oldestAgeSeconds: pending.length === 0 ? 0 : Math.floor((nowMs - Math.min(...pending.map(entry => entry.mtimeMs))) / 1000) };
}
