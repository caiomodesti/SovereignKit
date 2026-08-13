import { canonicalJson } from "./canonical.js";
import type { AnalysisSummary } from "./types.js";

export interface RenderedSummary {
  readonly markdown: string;
  readonly json: string;
  readonly csv: string;
}

export function renderSummary(summary: AnalysisSummary): RenderedSummary {
  return {
    markdown: renderMarkdown(summary),
    json: canonicalJson(summary),
    csv: renderCsv(summary),
  };
}

function renderMarkdown(summary: AnalysisSummary): string {
  const lines = [
    `# Experiment Summary: ${summary.definition.windowId}`,
    "",
    `- Policy: \`${summary.policyVersion}\``,
    `- Input hash: \`${summary.inputHash}\``,
    `- Experiment: \`${summary.definition.experimentId}@${summary.definition.experimentVersion}\``,
    `- Phase: \`${summary.definition.phase}\``,
    `- Observer: \`${summary.definition.observerId}\``,
    `- Configuration: \`${summary.definition.configurationHash}\``,
    "",
    "| Route | Classification | Evidence strength | Control | PROGRAM_X | Gap | Peer PROGRAM_X |",
    "|---|---|---|---:|---:|---:|---:|",
    ...summary.classifications.map(value => `| ${value.routeId} | ${value.classification} | ${value.evidenceStrength} | ${formatRate(value.controlSuccessRate)} | ${formatRate(value.testSuccessRate)} | ${formatRate(value.absoluteClassGap)} | ${value.peerTestBaseline.successRate === null ? "n/a" : formatRate(value.peerTestBaseline.successRate)} |`),
    "",
    "## Cell measurements",
    "",
    "| Route | Class | Complete | Missing | Invalid | Success | Inconclusive | Policy rate | Complete-case rate | Wilson 95% |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ...summary.cells.map(value => `| ${value.routeId} | ${value.transactionClass} | ${value.completeCount} | ${value.missingCount} | ${value.invalidExclusionCount} | ${value.successCount} | ${value.inconclusiveCount} | ${formatRate(value.successRate)} | ${value.completeCaseSuccessRate === null ? "n/a" : formatRate(value.completeCaseSuccessRate)} | ${formatRate(value.wilson95.low)}–${formatRate(value.wilson95.high)} |`),
    "",
    "> Experimental controlled classification only. `evidence_strength` is descriptive, not calibrated confidence.",
    "",
  ];
  return lines.join("\n");
}

function renderCsv(summary: AnalysisSummary): string {
  const header = "window_id,route_id,classification,evidence_strength,control_success_rate,test_success_rate,absolute_class_gap,peer_test_success_rate,input_hash";
  const rows = summary.classifications.map(value => [
    summary.definition.windowId,
    value.routeId,
    value.classification,
    value.evidenceStrength,
    value.controlSuccessRate.toFixed(6),
    value.testSuccessRate.toFixed(6),
    value.absoluteClassGap.toFixed(6),
    value.peerTestBaseline.successRate?.toFixed(6) ?? "",
    summary.inputHash,
  ].map(csvField).join(","));
  return `${[header, ...rows].join("\n")}\n`;
}

function csvField(value: string): string {
  return /[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

