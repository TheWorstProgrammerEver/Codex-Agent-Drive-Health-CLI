import { formatBytes } from "../adapters/bytes.js";
import type { DriveHealthReport, FindingSeverity } from "./model.js";

const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  ok: "OK",
  info: "INFO",
  opportunity: "OPPORTUNITY",
  warning: "WARNING",
  critical: "CRITICAL",
  unsupported: "UNSUPPORTED",
};

export function renderHumanReport(report: DriveHealthReport): string {
  const root = report.filesystems.find((filesystem) => filesystem.target === report.target);
  const lines = [
    `Drive Health Check (${report.generatedAt})`,
    "",
    `Host: ${report.host.osName ?? "Unknown OS"} ${report.host.kernelRelease ?? ""}`.trim(),
    `Target: ${report.target} (${root?.filesystemType ?? "unknown filesystem"})`,
    `Profile: ${report.profile}`,
    `Redaction: ${report.redaction.redacted ? "shareable identifiers redacted" : "identifiers included"}`,
    "",
    "Findings:",
    ...report.findings.map((finding) => `- [${SEVERITY_LABELS[finding.severity]}] ${finding.title}: ${finding.summary}`),
    "",
    "TRIM:",
    `- fstrim.timer: enabled=${report.trim.timer.unitFileState ?? "unknown"}, active=${report.trim.timer.activeState ?? "unknown"}`,
    `- advertised discard: ${report.trim.advertisedDiscard}`,
    `- fstrim dry-run entries: ${report.trim.dryRun.entries.length}${
      report.trim.dryRun.message ? ` (${report.trim.dryRun.message})` : ""
    }`,
    "",
    "Footprint:",
    `- journald: ${formatBytes(report.journald.diskUsageBytes)} (${report.journald.storageMode})`,
    ...report.directoryUsage.map((entry) => `- ${entry.path}: ${formatBytes(entry.sizeBytes)} (${entry.status})`),
    "",
    "Swap:",
    `- disk-backed swap active: ${report.swap.diskBackedSwapActive ? "yes" : "no"}`,
    `- zram devices: ${report.swap.zramDevices.length}`,
    `- vm.swappiness: ${report.swap.swappiness ?? "unknown"}`,
    "",
    "Tools:",
    ...report.tools.map((tool) => `- ${tool.command}: ${tool.installed ? "installed" : tool.installHint ?? "missing"}`),
  ];

  return `${lines.join("\n")}\n`;
}

