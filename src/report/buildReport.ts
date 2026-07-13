import { collectBlockDevices, advertisedDiscard } from "../adapters/lsblk.js";
import { collectDiskUsage } from "../adapters/diskUsage.js";
import { collectFstrim } from "../adapters/fstrim.js";
import { collectJournald } from "../adapters/journald.js";
import { collectMounts } from "../adapters/findmnt.js";
import { collectOs } from "../adapters/os.js";
import { collectSwap } from "../adapters/swap.js";
import { createCommandRunner, type CommandRunner } from "../adapters/command.js";
import { collectToolAvailability } from "../adapters/toolAvailability.js";
import { buildFindings } from "./findings.js";
import { redactReport, redactionRules } from "./redact.js";
import type { DriveHealthReport, HostProfile, SourceRecord } from "./model.js";

export interface BuildReportOptions {
  target: string;
  profile: HostProfile;
  includeIdentifiers: boolean;
  runner?: CommandRunner;
  now?: Date;
}

export async function buildReport(options: BuildReportOptions): Promise<DriveHealthReport> {
  const runner = options.runner ?? createCommandRunner();
  const sources: SourceRecord[] = [];

  const [os, tools, blockDevices, mounts, disk, fstrim, journald, swap] = await Promise.all([
    collectOs(runner),
    collectToolAvailability(runner),
    collectBlockDevices(runner),
    collectMounts(runner),
    collectDiskUsage(runner),
    collectFstrim(runner),
    collectJournald(runner),
    collectSwap(runner),
  ]);

  sources.push(
    ...os.sources,
    ...tools.sources,
    ...blockDevices.sources,
    ...mounts.sources,
    ...disk.sources,
    ...fstrim.sources,
    ...journald.sources,
    ...swap.sources,
  );

  const reportWithoutFindings: Omit<DriveHealthReport, "findings"> = {
    schemaVersion: "drive-health.report.v1",
    generatedAt: (options.now ?? new Date()).toISOString(),
    target: options.target,
    profile: options.profile,
    redaction: {
      identifiersIncluded: options.includeIdentifiers,
      redacted: !options.includeIdentifiers,
      rules: redactionRules(),
    },
    host: os.host,
    tools: tools.tools,
    blockDevices: blockDevices.devices,
    filesystems: mounts.mounts,
    diskUsage: disk.diskUsage,
    directoryUsage: disk.directoryUsage,
    trim: {
      timer: fstrim.timer,
      advertisedDiscard: advertisedDiscard(blockDevices.devices),
      dryRun: fstrim.dryRun,
    },
    journald: journald.journald,
    swap: swap.swap,
    sources,
  };

  const report: DriveHealthReport = {
    ...reportWithoutFindings,
    findings: buildFindings(reportWithoutFindings),
  };

  return redactReport(report, options.includeIdentifiers);
}

