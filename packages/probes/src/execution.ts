import { randomizeProbeUnits } from "./randomization.js";
import type {
  ProbeExecutionRecord,
  ProbeIndexExecutionWindow,
  ProbeUnit,
  RandomizedExecutionResult,
  RandomizedProbeUnit,
} from "./types.js";

export async function executeRandomizedProbePlan(
  units: readonly ProbeUnit[],
  seed: string,
  pairingWindowMs: number,
  execute: (unit: RandomizedProbeUnit) => Promise<void>,
  now: () => Date = () => new Date(),
): Promise<RandomizedExecutionResult> {
  if (!Number.isSafeInteger(pairingWindowMs) || pairingWindowMs < 1) throw new Error("pairingWindowMs must be positive");
  const plan = randomizeProbeUnits(units, seed);
  const records: ProbeExecutionRecord[] = [];
  for (const unit of plan) {
    const startedAt = now().toISOString();
    try {
      await execute(unit);
      records.push({ unit, startedAt, completedAt: now().toISOString(), outcome: "COMPLETED" });
    } catch (error) {
      records.push({
        unit,
        startedAt,
        completedAt: now().toISOString(),
        outcome: "FAILED",
        errorClass: error instanceof Error ? error.name : "UnknownThrownValue",
      });
    }
  }
  return { seed, records, pairingWindows: deriveWindows(records, pairingWindowMs) };
}

function deriveWindows(records: readonly ProbeExecutionRecord[], pairingWindowMs: number): readonly ProbeIndexExecutionWindow[] {
  const byProbeIndex = new Map<number, ProbeExecutionRecord[]>();
  for (const record of records) {
    const group = byProbeIndex.get(record.unit.probeIndex) ?? [];
    group.push(record);
    byProbeIndex.set(record.unit.probeIndex, group);
  }
  return [...byProbeIndex.entries()]
    .map(([probeIndex, group]) => {
      const starts = group.map(record => Date.parse(record.startedAt));
      const first = Math.min(...starts);
      const last = Math.max(...starts);
      const spanMs = last - first;
      return {
        probeIndex,
        firstStartAt: new Date(first).toISOString(),
        lastStartAt: new Date(last).toISOString(),
        spanMs,
        pairingWindowMs,
        breached: spanMs > pairingWindowMs,
      };
    })
    .sort((left, right) => left.probeIndex - right.probeIndex);
}
