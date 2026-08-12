import type { TransactionTimeline } from "./types.js";

export function formatTimeline(timeline: TransactionTimeline): string {
  const start = BigInt(timeline.lifecycle[0]?.monotonicNs ?? "0");
  const rows = timeline.lifecycle.map(entry => {
    const elapsedMs = Number(BigInt(entry.monotonicNs) - start) / 1_000_000;
    return `${entry.state.padEnd(28)} +${elapsedMs.toFixed(3)} ms`;
  });
  return [`TX ${timeline.signature}`, ...rows, `OUTCOME ${timeline.executionOutcome}`, `STATE ${timeline.derivedState}`].join("\n");
}
