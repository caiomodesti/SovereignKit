import { createHmac } from "node:crypto";

import type { ProbeUnit, RandomizedProbeUnit } from "./types.js";

function deterministicUint32(seed: string, counter: number): number {
  const digest = createHmac("sha256", seed).update(counter.toString()).digest();
  return digest.readUInt32BE(0);
}

export function randomizeProbeUnits(units: readonly ProbeUnit[], seed: string): readonly RandomizedProbeUnit[] {
  if (seed.length < 16) throw new Error("randomization seed must contain at least 16 characters");
  const byProbeIndex = new Map<number, ProbeUnit[]>();
  for (const unit of units) {
    const group = byProbeIndex.get(unit.probeIndex) ?? [];
    group.push(unit);
    byProbeIndex.set(unit.probeIndex, group);
  }
  const groups = [...byProbeIndex.entries()];
  shuffle(groups, `${seed}\u001fgroups`);
  const shuffled = groups.flatMap(([probeIndex, group]) => {
    const copy = [...group];
    shuffle(copy, `${seed}\u001fprobe-index\u001f${probeIndex}`);
    return copy;
  });
  return shuffled.map((unit, executionOrdinal) => ({ ...unit, executionOrdinal }));
}

function shuffle<T>(values: T[], seed: string): void {
  let counter = 0;
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = deterministicUint32(seed, counter++) % (index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }
}
