import { createHash } from 'node:crypto';

import { createRehearsalSchedule } from './grant-m2-scheduler.mjs';
import { scheduleHash } from './grant-m2-dispatch.mjs';

const OBSERVERS = ['observer-aws-a', 'observer-google-e2-micro', 'observer-oracle-a1'];
const AUTHORIZATION_TEXT = 'Autorizo executar agora o rehearsal M2 de 1 hora, com até 12 transações reais na Solana Devnet, usando somente quota gratuita e sem iniciar a janela oficial de 14 dias.';

export function createGrantM2LiveRun({ runId, startAt, authorizedAt, authorizationText, quota, observerSequences, sourceCommit }) {
  canonicalTime(startAt); canonicalTime(authorizedAt);
  if (authorizationText !== AUTHORIZATION_TEXT || Date.parse(startAt) < Date.parse(authorizedAt) + 120_000) throw Error('M2 rehearsal authorization or lead time is invalid');
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit ?? '')) throw Error('M2 rehearsal source commit is invalid');
  if (Object.keys(observerSequences ?? {}).sort().join(',') !== [...OBSERVERS].sort().join(',') ||
      OBSERVERS.some(observer => !Number.isSafeInteger(observerSequences[observer]) || observerSequences[observer] < 0)) {
    throw Error('M2 rehearsal observer sequence bases are invalid');
  }
  const schedule = createRehearsalSchedule({ runId, startAt, quota });
  const authorization = {
    schema_version: 'GrantM2OperatorAuthorization@0.1.0',
    authorized: true,
    scope: 'PRE_M2_REHEARSAL_ONLY',
    exact_text_sha256: sha(authorizationText),
    schedule_sha256: scheduleHash(schedule),
    not_before: schedule.start_at,
    not_after: schedule.end_at,
    authorized_at: authorizedAt,
    zero_incremental_spend_only: true,
    maximum_real_devnet_transactions: 12,
    starts_official_fourteen_day_window: false,
  };
  return {
    schema_version: 'GrantM2LiveRehearsalRun@0.1.0', status: 'AUTHORIZED_NOT_STARTED',
    run_id: runId, source_commit: sourceCommit, schedule, authorization,
    observer_initial_sequences: structuredClone(observerSequences),
    transaction_count_limit: 12, qualifying_grant_units: 0,
    rehearsal_started: false, milestone_2_started: false, official_window_started: false,
  };
}

export function validateGrantM2LiveRun(run) {
  if (run?.schema_version !== 'GrantM2LiveRehearsalRun@0.1.0' || run.status !== 'AUTHORIZED_NOT_STARTED' ||
      run.transaction_count_limit !== 12 || run.qualifying_grant_units !== 0 || run.rehearsal_started !== false ||
      run.milestone_2_started !== false || run.official_window_started !== false ||
      run.authorization?.exact_text_sha256 !== sha(AUTHORIZATION_TEXT) || run.authorization.schedule_sha256 !== scheduleHash(run.schedule) ||
      run.authorization.zero_incremental_spend_only !== true || run.authorization.maximum_real_devnet_transactions !== 12 ||
      run.authorization.starts_official_fourteen_day_window !== false) throw Error('M2 live rehearsal run contract is invalid');
  return { status: 'PASS', gate: 'GRANT_M2_LIVE_REHEARSAL_RUN', expectedTransactions: 12, officialWindowStarted: false };
}

export { AUTHORIZATION_TEXT };
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalTime(value) { const ms = Date.parse(value); if (!Number.isSafeInteger(ms) || new Date(ms).toISOString() !== value) throw Error('Canonical UTC timestamp required'); }
