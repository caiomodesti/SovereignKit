import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { importObserverPrivateKey } from '../packages/probes/dist/signing.js';
import { receiveAssignmentWriteOnce } from './lib/grant-m2-assignment-inbox.mjs';

const [entryText, authorityText, observerKeyText, inboxText, receivedAt] = process.argv.slice(2);
if ([entryText, authorityText, observerKeyText, inboxText, receivedAt].some(value => value === undefined)) {
  throw Error('usage: receive-grant-m2-assignment <prepared-entry> <assignment-authority> <observer-private-key> <inbox> <received-at>');
}
const [entry, assignmentAuthority, observerKeyDocument] = await Promise.all([
  readJson(resolve(entryText)), readJson(resolve(authorityText)), readJson(resolve(observerKeyText)),
]);
const observerKey = importObserverPrivateKey(observerKeyDocument);
const result = await receiveAssignmentWriteOnce({ directory: resolve(inboxText), entry, assignmentAuthority, observerKey, receivedAt });
process.stdout.write(`${JSON.stringify(result)}\n`);

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
