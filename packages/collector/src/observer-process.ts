import { readFile } from "node:fs/promises";

import {
  importObserverPrivateKey,
  signProbeResult,
  type ObserverPrivateKeyDocument,
  type UnsignedProbeResult,
} from "@sovereignkit/probes";

const [privateKeyPath, unsignedResultPath, collectorUrl] = process.argv.slice(2);
if (privateKeyPath === undefined || unsignedResultPath === undefined || collectorUrl === undefined) {
  throw new Error("usage: sovereignkit-observer <private-key.json> <unsigned-result.json> <collector-url>");
}
const privateKeyDocument = JSON.parse(await readFile(privateKeyPath, "utf8")) as ObserverPrivateKeyDocument;
const unsignedResult = JSON.parse(await readFile(unsignedResultPath, "utf8")) as UnsignedProbeResult;
const keyPair = importObserverPrivateKey(privateKeyDocument);
const signedResult = signProbeResult(unsignedResult, keyPair);
const response = await fetch(new URL("/v0/probe-results", collectorUrl), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(signedResult),
  signal: AbortSignal.timeout(10_000),
});
const responseBody = await response.text();
if (!response.ok) {
  process.stderr.write(`${JSON.stringify({ event: "OBSERVER_SUBMISSION_REJECTED", statusCode: response.status, response: responseBody })}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ event: "OBSERVER_SUBMISSION_COMPLETED", statusCode: response.status, resultId: signedResult.result_id, response: JSON.parse(responseBody) as unknown })}\n`);
}
