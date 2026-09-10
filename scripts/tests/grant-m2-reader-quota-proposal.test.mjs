import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateGrantM2ReaderTopologyProposal, validateGrantM2ResourceQuotaEstimate } from "../lib/grant-m2-reader-quota-proposal.mjs";

const topology = JSON.parse(await readFile("deploy/grant-pilot/m2-reader-topology-proposal.json", "utf8"));
const quota = JSON.parse(await readFile("deploy/grant-pilot/m2-resource-quota-estimate.json", "utf8"));

test("accepts the undeployed correlated-reader proposal without starting M2", () => {
  assert.deepEqual(validateGrantM2ReaderTopologyProposal(structuredClone(topology)), {
    status: "PASS",
    gate: "GRANT_M2_READER_TOPOLOGY_PROPOSAL",
    logicalReaders: 3,
    quorum: 2,
    deploymentAuthorized: false,
    milestone2Started: false,
  });
});

test("rejects hidden correlation or accidental deployment authorization", () => {
  const hiddenCorrelation = structuredClone(topology);
  hiddenCorrelation.limitations.public_reader_failures_are_correlated = false;
  assert.throws(() => validateGrantM2ReaderTopologyProposal(hiddenCorrelation), /limitation/u);

  const authorized = structuredClone(topology);
  authorized.operator_decision.authorized = true;
  assert.throws(() => validateGrantM2ReaderTopologyProposal(authorized), /cannot authorize/u);
});

test("recomputes the conservative quota budget and retains authorization gates", () => {
  assert.deepEqual(validateGrantM2ResourceQuotaEstimate(structuredClone(quota)), {
    status: "PASS",
    gate: "GRANT_M2_RESOURCE_QUOTA_ESTIMATE",
    estimatedComputeUnitsWithContingency: 5854464,
    remainingHeadroomComputeUnits: 24143196,
    quotaApproved: false,
    milestone2Started: false,
  });
});

test("rejects quota arithmetic drift and a missing throughput margin", () => {
  const arithmetic = structuredClone(quota);
  arithmetic.alchemy_upper_estimate.total_compute_units -= 1;
  assert.throws(() => validateGrantM2ResourceQuotaEstimate(arithmetic), /quota arithmetic/u);

  const burst = structuredClone(quota);
  burst.burst_bounds.alchemy_max_compute_units_per_second = 300;
  assert.throws(() => validateGrantM2ResourceQuotaEstimate(burst), /burst bound/u);
});
