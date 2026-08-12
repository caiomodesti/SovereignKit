import { sha256Hex } from "./canonical.js";
import type { ProbeDefinition, ProbeUnit, TransactionClass } from "./types.js";

export function deriveUnitId(unit: Omit<ProbeUnit, "unitId">): string {
  return sha256Hex([
    unit.experimentId, unit.experimentVersion, unit.phase, unit.observerId,
    unit.routeId, unit.transactionClass, unit.probeIndex.toString(),
  ].join("\u001f"));
}

export function declareProbeUnits(definition: ProbeDefinition): readonly ProbeUnit[] {
  validateDefinition(definition);
  const units: ProbeUnit[] = [];
  for (const probeIndex of definition.probeIndices) {
    for (const routeId of definition.routeIds) {
      for (const transactionClass of definition.transactionClasses) {
        const base = {
          experimentId: definition.experimentId,
          experimentVersion: definition.experimentVersion,
          phase: definition.phase,
          observerId: definition.observerId,
          routeId,
          transactionClass,
          probeIndex,
        } as const;
        units.push({ ...base, unitId: deriveUnitId(base) });
      }
    }
  }
  return units;
}

function validateDefinition(definition: ProbeDefinition): void {
  if (definition.routeIds.length === 0 || new Set(definition.routeIds).size !== definition.routeIds.length) {
    throw new Error("routeIds must be non-empty and unique");
  }
  if (!hasBothClasses(definition.transactionClasses)) {
    throw new Error("transactionClasses must contain MATCHED_CONTROL and PROGRAM_X exactly once");
  }
  if (definition.probeIndices.length === 0 || new Set(definition.probeIndices).size !== definition.probeIndices.length) {
    throw new Error("probeIndices must be non-empty and unique");
  }
  if (definition.probeIndices.some(index => !Number.isSafeInteger(index) || index < 0)) {
    throw new Error("probeIndices must be non-negative safe integers");
  }
  if (definition.randomizationSeed.length < 16) throw new Error("randomizationSeed must contain at least 16 characters");
  if (!Number.isSafeInteger(definition.pairingWindowMs) || definition.pairingWindowMs < 1) {
    throw new Error("pairingWindowMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(definition.computeUnitLimit) || definition.computeUnitLimit < 1) {
    throw new Error("computeUnitLimit must be a positive safe integer");
  }
  if (definition.computeUnitLimit > 0xffff_ffff) throw new Error("computeUnitLimit exceeds u32");
  if (definition.computeUnitPriceMicroLamports < 0n || definition.computeUnitPriceMicroLamports > 0xffff_ffff_ffff_ffffn) {
    throw new Error("computeUnitPriceMicroLamports must fit u64");
  }
  for (const transactionClass of definition.transactionClasses) {
    const expected = definition.expectedComputeUnits[transactionClass];
    if (!Number.isSafeInteger(expected) || expected < 0) throw new Error(`invalid expected compute units for ${transactionClass}`);
  }
}

function hasBothClasses(classes: readonly TransactionClass[]): boolean {
  return classes.length === 2 && new Set(classes).size === 2 &&
    classes.includes("MATCHED_CONTROL") && classes.includes("PROGRAM_X");
}
