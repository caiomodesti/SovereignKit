import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";

export function selectGrantM2OfficialDeliveryReceipt(deliveryLogText, resultId) {
  if (typeof deliveryLogText !== "string" || deliveryLogText.length === 0 || !deliveryLogText.endsWith("\n") ||
      typeof resultId !== "string" || resultId.length === 0) {
    throw new Error("M2 official delivery log or result ID is invalid");
  }
  const matches = [];
  for (const [index, line] of deliveryLogText.trimEnd().split("\n").entries()) {
    let record;
    try { record = JSON.parse(line); } catch { throw new Error(`M2 official delivery log has invalid JSON at record ${index}`); }
    if (record?.result_id === resultId) matches.push(record);
  }
  if (matches.length !== 1) throw new Error("M2 official delivery receipt is missing or ambiguous");
  return `${JSON.stringify(matches[0])}\n`;
}

export async function persistGrantM2OfficialSlotEvidence({ directory, entry, completion, unsignedResultText, rawText, signedResult, deliveryReceiptText }) {
  const slotId = entry?.slot_id;
  if (typeof directory !== "string" || directory.length === 0 || !/^[a-f0-9]{64}$/u.test(slotId ?? "") ||
      completion?.resultId !== signedResult?.result_id) throw new Error("M2 official evidence persistence input is invalid");
  const slotDirectory = join(directory, slotId);
  await mkdir(slotDirectory, { recursive: true, mode: 0o700 });
  const files = {
    "prepared-dispatch.json": `${JSON.stringify(entry)}\n`,
    "worker-completion.json": `${JSON.stringify(completion)}\n`,
    "unsigned-result.json": canonicalFile(unsignedResultText, "unsigned result"),
    "raw-observations.jsonl": completeJsonl(rawText, "raw observations"),
    "signed-result.json": `${JSON.stringify(signedResult)}\n`,
    "delivery-receipt.json": canonicalFile(deliveryReceiptText, "delivery receipt"),
  };
  for (const [name, contents] of Object.entries(files)) await writeImmutable(join(slotDirectory, name), contents);
  const manifest = {
    schema_version: "GrantM2OfficialSlotEvidence@0.1.0",
    slot_id: slotId,
    result_id: signedResult.result_id,
    files: Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, sha256(contents)])),
    contains_private_key_material: false,
  };
  await writeImmutable(join(slotDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  return { slot_directory: slotDirectory, manifest };
}

function canonicalFile(text, label) {
  if (typeof text !== "string" || !text.endsWith("\n") || text.trimEnd().includes("\n")) throw new Error(`M2 official ${label} is not one complete JSON record`);
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`M2 official ${label} contains invalid JSON`); }
  const canonical = `${JSON.stringify(value)}\n`;
  if (text !== canonical) throw new Error(`M2 official ${label} is not canonical`);
  return canonical;
}

function completeJsonl(text, label) {
  if (typeof text !== "string" || text.length === 0 || !text.endsWith("\n")) throw new Error(`M2 official ${label} is empty or partial`);
  for (const [index, line] of text.trimEnd().split("\n").entries()) {
    try { JSON.parse(line); } catch { throw new Error(`M2 official ${label} contains invalid JSON at record ${index}`); }
  }
  return text;
}

async function writeImmutable(path, contents) {
  try {
    const handle = await open(path, "wx", 0o600);
    try { await handle.writeFile(contents, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (await readFile(path, "utf8") !== contents) throw new Error("M2 official immutable evidence conflicts with an existing file");
  }
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
