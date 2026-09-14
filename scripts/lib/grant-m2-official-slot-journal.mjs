import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";

export const GRANT_M2_OFFICIAL_SLOT_JOURNAL_VERSION = "GrantM2OfficialSlotJournal@0.1.0";
const HASH = /^[a-f0-9]{64}$/u;
const ORDER = ["TRANSACTION_PREPARED", "SUBMISSION_ACKNOWLEDGED", "ASSIGNMENT_PREPARED"];

export function createGrantM2OfficialSlotJournal(directory) {
  if (typeof directory !== "string" || directory.length === 0) throw new Error("M2 official slot journal directory is invalid");
  return {
    async reserve({ scheduleHash, slotId, unitId, observerId, reservedAt }) {
      if (![scheduleHash, slotId, unitId].every(value => typeof value === "string" && HASH.test(value)) ||
          typeof observerId !== "string" || observerId.length === 0 || new Date(reservedAt).toISOString() !== reservedAt) {
        throw new Error("M2 official slot reservation is invalid");
      }
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const slotDirectory = join(directory, slotId);
      try { await mkdir(slotDirectory, { mode: 0o700 }); }
      catch (error) {
        if (error?.code === "EEXIST") return { status: "RECONCILIATION_REQUIRED", slot_id: slotId };
        throw error;
      }
      await writeOnce(join(slotDirectory, "00-reservation.json"), {
        schema_version: GRANT_M2_OFFICIAL_SLOT_JOURNAL_VERSION,
        state: "RESERVED",
        schedule_sha256: scheduleHash,
        slot_id: slotId,
        unit_id: unitId,
        observer_id: observerId,
        reserved_at: reservedAt,
      });
      let position = -1;
      let uncertain = false;
      return {
        status: "RESERVED",
        async record(state, evidence, recordedAt) {
          if (uncertain || state !== ORDER[position + 1] || new Date(recordedAt).toISOString() !== recordedAt ||
              evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("M2 official slot transition is invalid");
          position += 1;
          await writeOnce(join(slotDirectory, `${String(position + 1).padStart(2, "0")}-${state.toLowerCase().replaceAll("_", "-")}.json`), {
            schema_version: GRANT_M2_OFFICIAL_SLOT_JOURNAL_VERSION,
            state,
            slot_id: slotId,
            recorded_at: recordedAt,
            evidence,
          });
        },
        async markUncertain(stage, evidence, recordedAt) {
          if (uncertain || typeof stage !== "string" || stage.length === 0 || new Date(recordedAt).toISOString() !== recordedAt ||
              evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("M2 official uncertain outcome is invalid");
          uncertain = true;
          await writeOnce(join(slotDirectory, "reconciliation-required.json"), {
            schema_version: GRANT_M2_OFFICIAL_SLOT_JOURNAL_VERSION,
            state: "RECONCILIATION_REQUIRED",
            uncertain_stage: stage,
            slot_id: slotId,
            recorded_at: recordedAt,
            evidence,
          });
        },
      };
    },
  };
}

async function writeOnce(path, value) {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}
