import {
  createSolanaRpc,
  type Base64EncodedWireTransaction,
  type Signature,
} from "@solana/kit";

import type {
  ObservationReader,
  SignatureStatusResult,
  SubmissionResult,
  TransactionSubmitter,
} from "./coordinator.js";

export interface SolanaSubmissionProfile {
  readonly endpoint: string;
  readonly encodedTransaction: Base64EncodedWireTransaction;
  readonly blockhashContextSlot: bigint;
}

export class SolanaKitTransactionSubmitter implements TransactionSubmitter {
  readonly #profile: SolanaSubmissionProfile;

  constructor(profile: SolanaSubmissionProfile) {
    this.#profile = profile;
  }

  async submit(): Promise<SubmissionResult> {
    const rpc = createSolanaRpc(this.#profile.endpoint);
    try {
      const returnedSignature = await rpc.sendTransaction(this.#profile.encodedTransaction, {
        encoding: "base64",
        maxRetries: 5n,
        minContextSlot: this.#profile.blockhashContextSlot,
        preflightCommitment: "confirmed",
        skipPreflight: false,
      }).send();
      return { outcome: "acknowledged", returnedSignature };
    } catch (error) {
      return {
        outcome: "rejected",
        error: {
          category: categorizeSubmissionError(error),
          messageClass: error instanceof Error ? error.name : "NonErrorThrown",
          // A generic transport/RPC exception cannot prove whether forwarding occurred.
          mayHaveBeenForwarded: true,
        },
      };
    }
  }
}

export class SolanaKitObservationReader implements ObservationReader {
  readonly readerId: string;
  readonly #endpoint: string;

  constructor(readerId: string, endpoint: string) {
    this.readerId = readerId;
    this.#endpoint = endpoint;
  }

  async getSignatureStatus(signature: string, abortSignal?: AbortSignal): Promise<SignatureStatusResult> {
    const rpc = createSolanaRpc(this.#endpoint);
    const response = await rpc.getSignatureStatuses(
      [signature as Signature],
      { searchTransactionHistory: true },
    ).send(
      abortSignal === undefined ? undefined : { abortSignal },
    );
    const status = response.value[0];
    if (status === null || status === undefined) {
      return { status: null, rpcContextSlot: response.context.slot };
    }
    return {
      status: status.confirmationStatus ?? "processed",
      slot: status.slot,
      rpcContextSlot: response.context.slot,
      ...(status.err === null ? {} : { executionError: status.err }),
    };
  }

  async getBlockHeight(abortSignal?: AbortSignal): Promise<bigint> {
    const rpc = createSolanaRpc(this.#endpoint);
    return rpc.getBlockHeight({ commitment: "confirmed" }).send(
      abortSignal === undefined ? undefined : { abortSignal },
    );
  }
}

function categorizeSubmissionError(error: unknown): "PRE_FLIGHT" | "RPC" | "TRANSPORT" | "TIMEOUT" | "UNKNOWN" {
  if (error instanceof Error && (error.name === "AbortError" || /timeout/iu.test(error.message))) {
    return "TIMEOUT";
  }
  if (error instanceof TypeError) {
    return "TRANSPORT";
  }
  if (error instanceof Error && /preflight|simulation/iu.test(error.message)) {
    return "PRE_FLIGHT";
  }
  if (error instanceof Error) {
    return "RPC";
  }
  return "UNKNOWN";
}
