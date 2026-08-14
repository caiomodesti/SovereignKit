import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  JsonlEventStore,
  canonicalJson,
  deriveTimeline,
} from "../packages/telemetry/dist/index.js";

const root = resolve("fixtures/sprint-10/devnet-accepted-run-20260814T220116Z");
const evidence = JSON.parse(await readFile(resolve(root, "evidence.json"), "utf8"));
const retainedTimeline = JSON.parse(await readFile(resolve(root, "timeline.json"), "utf8"));
const retainedTimelineWithTypes = {
  ...retainedTimeline,
  validity: {
    ...retainedTimeline.validity,
    contextSlot: BigInt(retainedTimeline.validity.contextSlot),
    lastValidBlockHeight: BigInt(retainedTimeline.validity.lastValidBlockHeight),
  },
};
const store = new JsonlEventStore(resolve(root, "raw-events.jsonl"));
const rawEvents = await store.readByAttempt(retainedTimeline.attemptId);
const reconstructed = deriveTimeline(rawEvents);
const expectedLifecycle = [
  "CREATED",
  "SUBMISSION_ATTEMPTED",
  "RPC_ACKNOWLEDGED",
  "OBSERVATION_PENDING",
  "OBSERVED_EXECUTION_SUCCESS",
  "CONFIRMED",
  "FINALIZED",
];

assert(canonicalJson(reconstructed) === canonicalJson(retainedTimelineWithTypes), "raw JSONL no longer reconstructs the retained timeline");
assert(evidence.transactionSignature === retainedTimeline.signature, "evidence and timeline signatures differ");
assert(evidence.finalRpcStatus?.confirmationStatus === "finalized", "final RPC status must remain finalized");
assert(evidence.finalRpcStatus?.err === null, "final RPC status must remain successful");
assert(evidence.recipientFinalizedBalanceLamports === "1000000", "finalized recipient balance changed");
assert(evidence.commitments?.fundingSetup === "pre_funded_balance_confirmed", "funding provenance changed");
assert(evidence.keyManagement?.secretMaterialPersistedInEvidence === false, "evidence must not claim secret persistence");
assert(JSON.stringify(evidence.lifecycle) === JSON.stringify(expectedLifecycle), "lifecycle changed");
assert(evidence.quorum?.required === 2, "quorum threshold changed");
assert(evidence.quorum?.finalizedReaderIds?.length >= 2, "finalized quorum is missing");
assert(evidence.observationQuorum?.operationalIndependence === "not established by this test", "independence caveat changed");
assert(rawEvents.length === evidence.rawEventCount, "raw event count changed");

process.stdout.write(`${JSON.stringify({
  verified: true,
  signature: evidence.transactionSignature,
  state: retainedTimeline.derivedState,
  rawEventCount: rawEvents.length,
  finalizedQuorum: evidence.quorum.finalizedReaderIds.length,
})}\n`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
