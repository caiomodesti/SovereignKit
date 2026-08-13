import { createHash } from "node:crypto";

import { getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit";

import type { TransactionClassification } from "./types.js";

const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";

export function classifyControlledWireTransaction(
  encodedTransaction: string,
  controlledProgramAddress: string,
): TransactionClassification {
  try {
    const bytes = decodeStrictBase64(encodedTransaction);
    const transaction = getTransactionDecoder().decode(bytes);
    if (Object.keys(transaction.signatures).length !== 1) return unknown("signer count is not one");
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    if (message.version !== "legacy") return unknown("transaction version is not legacy");
    if (message.instructions.length !== 3) return unknown("instruction count is not three");
    const [limitInstruction, priceInstruction, classInstruction] = message.instructions;
    if (limitInstruction === undefined || priceInstruction === undefined || classInstruction === undefined) return unknown("instruction shape is incomplete");
    const programs = message.instructions.map(instruction => message.staticAccounts[instruction.programAddressIndex]);
    if (programs[0] !== COMPUTE_BUDGET_PROGRAM || programs[1] !== COMPUTE_BUDGET_PROGRAM || programs[2] !== controlledProgramAddress) {
      return unknown("program sequence is not the controlled builder shape");
    }
    if (limitInstruction.data?.length !== 5 || limitInstruction.data[0] !== 2) return unknown("compute limit instruction mismatch");
    if (priceInstruction.data?.length !== 9 || priceInstruction.data[0] !== 3) return unknown("compute price instruction mismatch");
    if ((classInstruction.accountIndices?.length ?? 0) !== 0) return unknown("controlled instruction unexpectedly has accounts");
    if (classInstruction.data?.length !== 17) return unknown("controlled instruction data length mismatch");
    const discriminator = classInstruction.data[0];
    if (discriminator !== 0 && discriminator !== 1) return unknown("unknown class discriminator");
    return {
      kind: "CONTROLLED",
      value: {
        classification: discriminator === 0 ? "MATCHED_CONTROL" : "PROGRAM_X",
        pairNonceHex: Buffer.from(classInstruction.data.subarray(1)).toString("hex"),
      },
    };
  } catch {
    return unknown("transaction decoding failed");
  }
}

export function hashPairNonce(pairNonceHex: string): string {
  return createHash("sha256").update(pairNonceHex).digest("hex");
}

function decodeStrictBase64(value: string): Uint8Array {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("invalid base64");
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new Error("non-canonical base64");
  return decoded;
}

function unknown(reason: string): TransactionClassification {
  return { kind: "UNKNOWN", reason };
}
