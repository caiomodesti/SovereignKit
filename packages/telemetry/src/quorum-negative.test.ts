import { expect, test } from "vitest";
import { evaluateObservationQuorum } from "./quorum.js";
import type { ReaderBlockHeightEvent, ReaderSignatureStatusEvent } from "./types.js";

// Minimal fixtures for the fields consumed by this evaluator, not schema proofs.
const heights = [0, 1].map(index => ({ sequence: index * 2 + 2, eventId: `height-${index}`,
  data: { readerId: `reader-${index}`, observationId: `attempt:0:reader-${index}:height`, blockHeight: 101n }
} as ReaderBlockHeightEvent));
const negatives = [0, 1].map(index => ({ sequence: index * 2 + 1, eventId: `status-${index}`,
  data: { readerId: `reader-${index}`, observationId: `attempt:0:reader-${index}:status`, status: null }
} as ReaderSignatureStatusEvent));

test("heights alone cannot prove successful negative status reads", () => {
  const result = evaluateObservationQuorum({ signatureEvents: [], blockHeightEvents: heights, lastValidBlockHeight: 100n });
  expect(result.expiredAt).toBeUndefined();
  expect(result.support.expiredHeightReaderIds).toEqual([]);
});
test("paired negative status and height responses can prove expiration", () => {
  expect(evaluateObservationQuorum({ signatureEvents: negatives, blockHeightEvents: heights, lastValidBlockHeight: 100n }).expiredAt).toBeDefined();
});
test("stale negative observations from another poll cannot justify expiration", () => {
  const stale = negatives.map(event => ({ ...event, data: { ...event.data, observationId: event.data.observationId.replace(":0:", ":previous:") } }));
  expect(evaluateObservationQuorum({ signatureEvents: stale, blockHeightEvents: heights, lastValidBlockHeight: 100n }).expiredAt).toBeUndefined();
});
