import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  address,
  createSolanaRpc,
  generateKeyPairSigner,
  lamports,
  type Base64EncodedWireTransaction,
  type Signature,
} from "@solana/kit";
import { describe, expect, test } from "vitest";

import { buildSignedProbe, declareProbeUnits, type ProbeDefinition, type TransactionClass } from "../src/index.js";

const endpoint = process.env.SOVEREIGNKIT_RPC_ENDPOINT ?? "http://127.0.0.1:8899";
const programAddress = process.env.SOVEREIGNKIT_MATCHED_PROGRAM_ADDRESS ?? "4Ywfurzjdhh83CUhTp1A3yaJuos4bSeYBtAZiJUnvq8h";
const artifactDirectory = resolve(process.env.SOVEREIGNKIT_ARTIFACT_DIR ?? "artifacts/sprint-5/manual-program-proof");
const fixtureDirectory = process.env.SOVEREIGNKIT_FIXTURE_DIR === undefined ? undefined : resolve(process.env.SOVEREIGNKIT_FIXTURE_DIR);

describe("Sprint 5 project-owned matched program proof", () => {
  test("executes unique matched pairs with identical structure and measured compute", async () => {
    await mkdir(artifactDirectory, { recursive: true });
    const rpc = createSolanaRpc(endpoint);
    expect(await rpc.getHealth().send()).toBe("ok");
    const account = await rpc.getAccountInfo(address(programAddress), { encoding: "base64" }).send();
    expect(account.value?.executable).toBe(true);

    const feePayer = await generateKeyPairSigner();
    const airdropSignature = await rpc.requestAirdrop(feePayer.address, lamports(2_000_000_000n), { commitment: "confirmed" }).send();
    await waitForConfirmation(rpc, airdropSignature);
    const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const definition = probeDefinition();
    const probes = await Promise.all(declareProbeUnits(definition).map(unit => buildSignedProbe(definition, unit, {
      feePayer,
      lifetime: {
        blockhash: latest.value.blockhash,
        lastValidBlockHeight: latest.value.lastValidBlockHeight,
        contextSlot: latest.context.slot,
      },
    })));

    const measurements: Measurement[] = [];
    for (const probe of probes) {
      const returnedSignature = await rpc.sendTransaction(probe.wireTransactionBase64 as Base64EncodedWireTransaction, {
        encoding: "base64",
        maxRetries: 0n,
        minContextSlot: latest.context.slot,
        preflightCommitment: "confirmed",
        skipPreflight: false,
      }).send();
      expect(returnedSignature).toBe(probe.signature);
      await waitForConfirmation(rpc, probe.signature);
      const transaction = await rpc.getTransaction(probe.signature, {
        commitment: "confirmed",
        encoding: "json",
        maxSupportedTransactionVersion: 0,
      }).send();
      expect(transaction?.meta?.err).toBeNull();
      expect(transaction?.meta?.computeUnitsConsumed).toBeDefined();
      const marker = probe.unit.transactionClass === "MATCHED_CONTROL" ? "SOVEREIGNKIT:00" : "SOVEREIGNKIT:01";
      expect(transaction?.meta?.logMessages?.some(message => message.endsWith(marker))).toBe(true);
      measurements.push({
        unitId: probe.unit.unitId,
        probeIndex: probe.unit.probeIndex,
        transactionClass: probe.unit.transactionClass,
        signature: probe.signature,
        pairNonceHex: probe.pairNonceHex,
        serializedSizeBytes: probe.fingerprint.serializedSizeBytes,
        computeUnitsConsumed: Number(transaction!.meta!.computeUnitsConsumed!),
        slot: Number(transaction!.slot),
      });
    }

    const signatures = new Set(measurements.map(value => value.signature));
    expect(signatures.size).toBe(measurements.length);
    for (const probeIndex of definition.probeIndices) {
      const control = measurement(measurements, probeIndex, "MATCHED_CONTROL");
      const programX = measurement(measurements, probeIndex, "PROGRAM_X");
      expect(control.signature).not.toBe(programX.signature);
      expect(control.pairNonceHex).toBe(programX.pairNonceHex);
      expect(control.serializedSizeBytes).toBe(programX.serializedSizeBytes);
      expect(control.computeUnitsConsumed).toBe(programX.computeUnitsConsumed);
    }

    const evidence = {
      evidenceVersion: "sprint-5-live-matched-program-proof@0.1.0",
      generatedAt: new Date().toISOString(),
      agaveVersion: "4.0.0",
      endpoint,
      programAddress,
      programDeployment: "validator --bpf-program; no program private key exists",
      airdropSignature,
      definition: jsonSafeDefinition(definition),
      pairCount: definition.probeIndices.length,
      uniqueSignatureCount: signatures.size,
      measuredComputeUnits: [...new Set(measurements.map(value => value.computeUnitsConsumed))],
      measurements,
    };
    await writeJson(join(artifactDirectory, "matched-program-evidence.json"), evidence);
    if (fixtureDirectory !== undefined) {
      await mkdir(fixtureDirectory, { recursive: true });
      await writeJson(join(fixtureDirectory, "matched-program-evidence.json"), evidence);
    }
  }, 120_000);
});

interface Measurement {
  readonly unitId: string;
  readonly probeIndex: number;
  readonly transactionClass: TransactionClass;
  readonly signature: Signature;
  readonly pairNonceHex: string;
  readonly serializedSizeBytes: number;
  readonly computeUnitsConsumed: number;
  readonly slot: number;
}

function probeDefinition(): ProbeDefinition {
  return {
    experimentId: "sprint-5-live-matched-program",
    experimentVersion: "1",
    phase: "healthy",
    observerId: "observer-local",
    routeIds: ["direct-agave"],
    transactionClasses: ["MATCHED_CONTROL", "PROGRAM_X"],
    probeIndices: Array.from({ length: 10 }, (_, index) => index),
    randomizationSeed: "sprint-5-matched-program-seed-v1",
    pairingWindowMs: 5_000,
    programAddress,
    computeUnitLimit: 20_000,
    computeUnitPriceMicroLamports: 0n,
    expectedComputeUnits: { MATCHED_CONTROL: 0, PROGRAM_X: 0 },
    feePayerPolicy: "one-funded-payer-live-program-proof",
    blockhashCommitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: false,
    maxRetries: 0,
  };
}

function measurement(values: readonly Measurement[], probeIndex: number, transactionClass: TransactionClass): Measurement {
  const value = values.find(item => item.probeIndex === probeIndex && item.transactionClass === transactionClass);
  if (value === undefined) throw new Error(`missing measurement ${probeIndex}/${transactionClass}`);
  return value;
}

async function waitForConfirmation(rpc: ReturnType<typeof createSolanaRpc>, signature: Signature): Promise<void> {
  for (let poll = 0; poll < 300; poll += 1) {
    const status = (await rpc.getSignatureStatuses([signature]).send()).value[0];
    if (status?.err !== null && status?.err !== undefined) throw new Error(`transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error("confirmation deadline reached");
}

function jsonSafeDefinition(definition: ProbeDefinition): unknown {
  return { ...definition, computeUnitPriceMicroLamports: definition.computeUnitPriceMicroLamports.toString() };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
