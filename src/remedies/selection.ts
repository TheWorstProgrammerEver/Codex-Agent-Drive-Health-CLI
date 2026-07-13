import type { DirectoryUsage, DriveHealthReport, Finding, FindingSeverity } from "../report/model.js";
import { REMEDIES } from "./catalogue.js";
import type { RemedyId, RemedySuggestion, RemedySuggestionStatus } from "./model.js";

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 6,
  warning: 5,
  opportunity: 4,
  unsupported: 3,
  info: 2,
  ok: 1,
};

export function selectRemedySuggestions(report: DriveHealthReport): RemedySuggestion[] {
  return REMEDIES.map((remedy) => suggestionFor(remedy.id, report)).sort(compareSuggestions);
}

export function compareSuggestions(left: RemedySuggestion, right: RemedySuggestion): number {
  return (
    statusRank(right.status) - statusRank(left.status) ||
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity] ||
    left.remedy.title.localeCompare(right.remedy.title)
  );
}

function suggestionFor(id: RemedyId, report: DriveHealthReport): RemedySuggestion {
  switch (id) {
    case "enable-weekly-fstrim":
      return trimSuggestion(report);
    case "set-root-noatime":
      return atimeSuggestion(report);
    case "limit-journald-disk-usage":
      return journaldLimitSuggestion(report);
    case "prefer-zram-over-disk-swap":
      return swapSuggestion(report);
    case "clean-package-cache":
      return packageCacheSuggestion(report);
    case "audit-large-log-writers":
      return logAuditSuggestion(report);
  }
}

function trimSuggestion(report: DriveHealthReport): RemedySuggestion {
  const finding = findingById(report, "trim-support");
  const dryRunEntries = report.trim.dryRun.entries.length;
  const timerEnabled = report.trim.timer.unitFileState === "enabled";
  const timerActive = report.trim.timer.activeState === "active";

  if (report.trim.advertisedDiscard !== "supported") {
    return buildSuggestion("enable-weekly-fstrim", "unsupported", "unsupported", "Discard support is not advertised; do not enable TRIM based on timer state alone.", {
      advertisedDiscard: report.trim.advertisedDiscard,
      dryRunEntries,
    });
  }

  if (dryRunEntries === 0) {
    return buildSuggestion("enable-weekly-fstrim", "advisory", "warning", "Discard is advertised, but fstrim dry-run did not confirm a filesystem target.", {
      advertisedDiscard: report.trim.advertisedDiscard,
      dryRunEntries,
      dryRunMessage: report.trim.dryRun.message,
    });
  }

  if (timerEnabled && timerActive) {
    return buildSuggestion("enable-weekly-fstrim", "already-applied", "ok", "fstrim.timer is enabled and active with confirmed dry-run output.", finding?.evidence);
  }

  return buildSuggestion("enable-weekly-fstrim", "recommended", "opportunity", "Periodic TRIM is supported but the weekly timer is not confirmed active.", finding?.evidence);
}

function atimeSuggestion(report: DriveHealthReport): RemedySuggestion {
  const finding = findingById(report, "root-atime-policy");
  if (finding?.severity === "ok") {
    return buildSuggestion("set-root-noatime", "already-applied", "ok", finding.summary, finding.evidence);
  }

  if (finding?.severity === "info") {
    return buildSuggestion("set-root-noatime", "advisory", "info", "Root uses relatime; noatime may reduce writes but needs fstab review.", finding.evidence);
  }

  return buildSuggestion("set-root-noatime", "recommended", "opportunity", finding?.summary ?? "Root atime policy should be reviewed.", finding?.evidence);
}

function journaldLimitSuggestion(report: DriveHealthReport): RemedySuggestion {
  const finding = findingById(report, "journald-footprint");
  if (report.journald.status !== "ok") {
    return buildSuggestion("limit-journald-disk-usage", "unsupported", "unsupported", "Journald state could not be collected reliably.", {
      status: report.journald.status,
      message: report.journald.message,
    });
  }

  if (finding?.severity === "opportunity" || (report.journald.diskUsageBytes ?? 0) > 256 * 1024 ** 2) {
    return buildSuggestion("limit-journald-disk-usage", "recommended", "opportunity", "Persistent journald usage is high enough to justify a bounded disk policy.", finding?.evidence);
  }

  return buildSuggestion("limit-journald-disk-usage", "advisory", "info", "Journald usage is currently modest; keep this remedy available if usage grows.", finding?.evidence);
}

function swapSuggestion(report: DriveHealthReport): RemedySuggestion {
  const finding = findingById(report, "swap-mode");
  if (report.swap.status !== "ok") {
    return buildSuggestion("prefer-zram-over-disk-swap", "unsupported", "unsupported", "Swap state could not be collected reliably.", {
      status: report.swap.status,
      message: report.swap.message,
    });
  }

  if (report.swap.diskBackedSwapActive) {
    return buildSuggestion("prefer-zram-over-disk-swap", "recommended", "opportunity", "Disk-backed swap is active on a write-sensitive host profile.", finding?.evidence);
  }

  if (report.swap.zramDevices.length > 0) {
    return buildSuggestion("prefer-zram-over-disk-swap", "already-applied", "ok", "zram swap is already active.", finding?.evidence);
  }

  return buildSuggestion("prefer-zram-over-disk-swap", "advisory", "info", "No disk-backed swap was detected; zram remains a profile-specific option.", finding?.evidence);
}

function packageCacheSuggestion(report: DriveHealthReport): RemedySuggestion {
  const cache = directoryByPath(report, "/var/cache/apt");
  if (!cache || cache.status !== "ok") {
    return buildSuggestion("clean-package-cache", "unsupported", "unsupported", "Package cache size was not collected.", {
      status: cache?.status,
      message: cache?.message,
    });
  }

  if ((cache.sizeBytes ?? 0) > 512 * 1024 ** 2) {
    return buildSuggestion("clean-package-cache", "recommended", "opportunity", "The apt cache is large enough to consider cleanup with apt's own tools.", {
      path: cache.path,
      sizeBytes: cache.sizeBytes,
    });
  }

  return buildSuggestion("clean-package-cache", "advisory", "info", "The apt cache is not large enough to prioritize cleanup.", {
    path: cache.path,
    sizeBytes: cache.sizeBytes,
  });
}

function logAuditSuggestion(report: DriveHealthReport): RemedySuggestion {
  const logUsage = directoryByPath(report, "/var/log");
  if (!logUsage || logUsage.status !== "ok") {
    return buildSuggestion("audit-large-log-writers", "unsupported", "unsupported", "Log directory usage was not collected.", {
      status: logUsage?.status,
      message: logUsage?.message,
    });
  }

  if ((logUsage.sizeBytes ?? 0) > 256 * 1024 ** 2 || (report.journald.diskUsageBytes ?? 0) > 256 * 1024 ** 2) {
    return buildSuggestion("audit-large-log-writers", "recommended", "opportunity", "Log footprint is large enough to audit writers before changing policy.", {
      varLogBytes: logUsage.sizeBytes,
      journaldBytes: report.journald.diskUsageBytes,
    });
  }

  return buildSuggestion("audit-large-log-writers", "advisory", "info", "Log footprint is currently modest; keep auditing as a diagnostic step.", {
    varLogBytes: logUsage.sizeBytes,
    journaldBytes: report.journald.diskUsageBytes,
  });
}

function buildSuggestion(
  id: RemedyId,
  status: RemedySuggestionStatus,
  severity: FindingSeverity,
  reason: string,
  evidence?: Record<string, unknown>,
): RemedySuggestion {
  const remedy = REMEDIES.find((candidate) => candidate.id === id);
  if (!remedy) {
    throw new Error(`Unknown remedy '${id}'.`);
  }

  return { remedy, status, severity, reason, evidence };
}

function findingById(report: DriveHealthReport, id: string): Finding | undefined {
  return report.findings.find((finding) => finding.id === id);
}

function directoryByPath(report: DriveHealthReport, path: string): DirectoryUsage | undefined {
  return report.directoryUsage.find((entry) => entry.path === path);
}

function statusRank(status: RemedySuggestionStatus): number {
  switch (status) {
    case "recommended":
      return 4;
    case "advisory":
      return 3;
    case "unsupported":
      return 2;
    case "already-applied":
      return 1;
  }
}
