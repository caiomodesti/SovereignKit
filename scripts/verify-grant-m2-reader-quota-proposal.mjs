import { readFile } from "node:fs/promises";
import { validateGrantM2ReaderTopologyProposal, validateGrantM2ResourceQuotaEstimate } from "./lib/grant-m2-reader-quota-proposal.mjs";

const topology = JSON.parse(await readFile("deploy/grant-pilot/m2-reader-topology-proposal.json", "utf8"));
const quota = JSON.parse(await readFile("deploy/grant-pilot/m2-resource-quota-estimate.json", "utf8"));
process.stdout.write(`${JSON.stringify(validateGrantM2ReaderTopologyProposal(topology))}\n`);
process.stdout.write(`${JSON.stringify(validateGrantM2ResourceQuotaEstimate(quota))}\n`);
