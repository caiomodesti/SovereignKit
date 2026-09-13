import { createHash } from 'node:crypto';

import { evaluateReaderClaimQuorum } from '../../packages/probes/dist/reader-quorum.js';

export function reconcileGrantM2RehearsalSlot({ entry, completion, rawText }) {
  const assignment = entry?.assignment;
  const job = assignment?.job;
  if (entry?.schema_version !== 'GrantM2PreparedDispatch@0.1.0' || assignment?.schemaVersion !== 'ObservationAssignment@0.1.0' ||
      job?.schemaVersion !== 'ObservationJob@0.1.0' || typeof assignment.assignmentId !== 'string' ||
      typeof assignment.payloadHash !== 'string' || typeof job.signature !== 'string' || typeof job.observerId !== 'string' ||
      !Number.isSafeInteger(job.submission?.last_valid_block_height)) throw Error('prepared rehearsal assignment is invalid');
  if (completion?.event !== 'M2_OBSERVATION_JOB_COMPLETED' || completion.resultId !== job.resultId ||
      completion.qualifyingUnits !== 0 || completion.terminalState !== 'FINALIZED') throw Error('rehearsal completion is invalid or not finalized');

  const polls = parseJsonl(rawText);
  let terminal;
  let hasLedgerObservation = false;
  let previousObservedAt = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < polls.length; index += 1) {
    const poll = polls[index];
    const observedAt = Date.parse(poll?.observed_at);
    if (poll?.schema_version !== 'RawObservationPoll@0.2.0' || poll.assignment_id !== assignment.assignmentId ||
        poll.assignment_payload_hash !== assignment.payloadHash || poll.observer_id !== job.observerId ||
        poll.signature !== job.signature || poll.poll_index !== index || !Number.isFinite(observedAt) || observedAt < previousObservedAt) {
      throw Error('raw rehearsal poll provenance or sequence is invalid');
    }
    previousObservedAt = observedAt;
    validateClaims(poll.claims, poll.observed_at);
    hasLedgerObservation ||= poll.claims.some(claim => claim.signature_status !== null);
    const decision = evaluateReaderClaimQuorum(poll.claims, job.submission.last_valid_block_height, hasLedgerObservation);
    if (decision.terminal !== undefined) {
      if (index !== polls.length - 1) throw Error('raw rehearsal evidence continues after terminal quorum');
      terminal = decision.terminal;
    }
  }
  if (terminal !== completion.terminalState) throw Error('raw-to-derived terminal state does not match completion');
  return {
    slot_id: entry.slot_id,
    observer_id: job.observerId,
    route_id: job.unit?.route_id,
    unit_id: job.unit?.unit_id,
    signature: job.signature,
    result_id: job.resultId,
    terminal_state: terminal,
    polls: polls.length,
    raw_sha256: createHash('sha256').update(rawText).digest('hex'),
    qualifying_units: 0,
  };
}

function parseJsonl(text) {
  if (typeof text !== 'string' || text.length === 0 || !text.endsWith('\n')) throw Error('raw rehearsal JSONL is empty or partial');
  return text.trimEnd().split('\n').map((line, index) => {
    try { return JSON.parse(line); } catch { throw Error(`raw rehearsal JSONL is invalid at record ${index}`); }
  });
}

function validateClaims(claims, observedAt) {
  if (!Array.isArray(claims) || claims.length !== 3 || new Set(claims.map(item => item?.reader_id)).size !== 3 ||
      new Set(claims.map(item => item?.claim_id)).size !== 3) throw Error('raw rehearsal poll does not contain three unique readers and claims');
  for (const claim of claims) {
    if (typeof claim.claim_id !== 'string' || typeof claim.reader_id !== 'string' || claim.observed_at !== observedAt ||
        ![null, 'processed', 'confirmed', 'finalized'].includes(claim.signature_status)) throw Error('raw rehearsal reader claim is invalid');
  }
}
