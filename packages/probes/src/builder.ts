import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  address,
  blockhash,
  type Instruction,
} from "@solana/kit";

import { sha256Hex } from "./canonical.js";
import type { BuiltProbe, ProbeBuildContext, ProbeDefinition, ProbeUnit, StructuralFingerprint } from "./types.js";
import { MATCHING_PROFILE_VERSION } from "./types.js";
import { deriveUnitId } from "./units.js";

const COMPUTE_BUDGET_PROGRAM = address("ComputeBudget111111111111111111111111111111");

function unitPairNonce(unit: ProbeUnit): Uint8Array {
  const pairKey = [unit.experimentId, unit.experimentVersion, unit.phase, unit.observerId,
    unit.routeId, unit.probeIndex.toString()].join("\u001f");
  return Uint8Array.from(Buffer.from(sha256Hex(pairKey).slice(0, 32), "hex"));
}

function computeLimitInstruction(limit: number): Instruction {
  const data = new Uint8Array(5);
  const view = new DataView(data.buffer);
  data[0] = 2;
  view.setUint32(1, limit, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data };
}

function computePriceInstruction(price: bigint): Instruction {
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  data[0] = 3;
  view.setBigUint64(1, price, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data };
}

export async function buildSignedProbe(
  definition: ProbeDefinition,
  unit: ProbeUnit,
  context: ProbeBuildContext,
): Promise<BuiltProbe> {
  assertUnitBelongsToDefinition(definition, unit);
  const discriminator = unit.transactionClass === "MATCHED_CONTROL" ? 0 : 1;
  const pairNonce = unitPairNonce(unit);
  const classData = new Uint8Array(1 + pairNonce.length);
  classData[0] = discriminator;
  classData.set(pairNonce, 1);

  const instructions: readonly Instruction[] = [
    computeLimitInstruction(definition.computeUnitLimit),
    computePriceInstruction(definition.computeUnitPriceMicroLamports),
    { programAddress: address(definition.programAddress), data: classData },
  ];
  const message = pipe(
    createTransactionMessage({ version: "legacy" }),
    value => setTransactionMessageFeePayerSigner(context.feePayer, value),
    value => setTransactionMessageLifetimeUsingBlockhash({
      blockhash: blockhash(context.lifetime.blockhash),
      lastValidBlockHeight: context.lifetime.lastValidBlockHeight,
    }, value),
    value => appendTransactionMessageInstruction(instructions[0]!, value),
    value => appendTransactionMessageInstruction(instructions[1]!, value),
    value => appendTransactionMessageInstruction(instructions[2]!, value),
  );
  const signed = await signTransactionMessageWithSigners(message);
  const wireTransactionBase64 = getBase64EncodedWireTransaction(signed);
  const fingerprint: StructuralFingerprint = {
    version: MATCHING_PROFILE_VERSION,
    programAddress: definition.programAddress,
    accountMetas: [],
    signerRoles: ["fee_payer"],
    instructionPrograms: instructions.map(instruction => instruction.programAddress),
    instructionDataLengths: instructions.map(instruction => instruction.data?.length ?? 0),
    serializedSizeBytes: Buffer.from(wireTransactionBase64, "base64").length,
    computeUnitLimit: definition.computeUnitLimit,
    computeUnitPriceMicroLamports: definition.computeUnitPriceMicroLamports.toString(),
    feePayerPolicy: definition.feePayerPolicy,
    expectedComputeUnits: definition.expectedComputeUnits[unit.transactionClass],
    expectedResult: "success",
  };
  return {
    unit,
    discriminator,
    pairNonceHex: Buffer.from(pairNonce).toString("hex"),
    signature: getSignatureFromTransaction(signed),
    wireTransactionBase64,
    fingerprint,
    blockhash: context.lifetime.blockhash,
    blockhashContextSlot: context.lifetime.contextSlot,
    lastValidBlockHeight: context.lifetime.lastValidBlockHeight,
  };
}

function assertUnitBelongsToDefinition(definition: ProbeDefinition, unit: ProbeUnit): void {
  if (unit.experimentId !== definition.experimentId || unit.experimentVersion !== definition.experimentVersion ||
      unit.phase !== definition.phase || unit.observerId !== definition.observerId ||
      !definition.routeIds.includes(unit.routeId) || !definition.transactionClasses.includes(unit.transactionClass) ||
      !definition.probeIndices.includes(unit.probeIndex)) {
    throw new Error(`unit ${unit.unitId} does not belong to the ProbeDefinition`);
  }
  const { unitId: _unitId, ...identity } = unit;
  if (unit.unitId !== deriveUnitId(identity)) throw new Error(`unit ${unit.unitId} has an invalid derived unitId`);
}
