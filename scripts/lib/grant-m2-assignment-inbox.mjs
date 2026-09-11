import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';

import { verifyObservationAssignment } from '../../packages/collector/dist/observation-assignment.js';
import { signAssignmentReceipt } from './grant-m2-assignment-receipt.mjs';

async function writeOnce(path, value) {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function receiveAssignmentWriteOnce({ directory, entry, assignmentAuthority, observerKey, receivedAt }) {
  if (typeof directory !== 'string' || directory.length === 0 || entry?.schema_version !== 'GrantM2PreparedDispatch@0.1.0') {
    throw Error('Invalid assignment inbox request');
  }
  const received = new Date(receivedAt);
  if (Number.isNaN(received.getTime()) || received.toISOString() !== receivedAt) throw Error('Canonical receipt timestamp required');
  verifyObservationAssignment(entry.assignment, assignmentAuthority, received);
  if (entry.assignment.job?.observerId !== observerKey?.observerId || entry.assignment.job?.observerKeyId !== observerKey?.keyId) {
    throw Error('Assignment does not target this observer key');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const assignmentDirectory = join(directory, entry.assignment.assignmentId);
  try { await mkdir(assignmentDirectory, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === 'EEXIST') return { status: 'RECONCILIATION_REQUIRED', assignment_id: entry.assignment.assignmentId };
    throw error;
  }

  // Once the claim directory exists it is never removed automatically. Any
  // interruption becomes visible and requires an operator decision.
  await writeOnce(join(assignmentDirectory, 'assignment.json'), entry);
  const receipt = signAssignmentReceipt({ entry, receivedAt }, observerKey);
  await writeOnce(join(assignmentDirectory, 'receipt.json'), receipt);
  return { status: 'RECEIVED', receipt };
}

