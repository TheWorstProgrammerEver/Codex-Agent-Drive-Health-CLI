import { advertisedDiscard } from "../adapters/lsblk.js";
import { formatBytes } from "../adapters/bytes.js";
import type { DriveHealthReport, Finding, MountInfo, ToolAvailability } from "./model.js";

export function buildFindings(report: Omit<DriveHealthReport, "findings">): Finding[] {
  const findings = [
    rootAtimeFinding(report.filesystems, report.target),
    trimFinding(report),
    smartctlFinding(report.tools),
    journaldFinding(report),
    swapFinding(report),
    packageCacheFinding(report),
  ];

  if (report.profile === "pi-usb-flash") {
    findings.push(piUsbFlashProfileFinding(report));
  }

  return findings;
}

function rootAtimeFinding(filesystems: MountInfo[], target: string): Finding {
  const root = filesystems.find((filesystem) => filesystem.target === target) ?? filesystems.find((filesystem) => filesystem.target === "/");
  const options = root?.options ?? [];

  if (options.includes("noatime") || options.includes("relatime")) {
    return {
      id: "root-atime-policy",
      severity: options.includes("noatime") ? "ok" : "info",
      title: "Root filesystem atime policy",
      summary: `Root mount uses ${options.includes("noatime") ? "noatime" : "relatime"}.`,
      evidence: { target: root?.target, filesystemType: root?.filesystemType, options },
    };
  }

  return {
    id: "root-atime-policy",
    severity: "opportunity",
    title: "Root filesystem atime policy",
    summary: "Root mount does not advertise noatime or relatime in collected mount options.",
    evidence: { target: root?.target, filesystemType: root?.filesystemType, options },
    recommendation: "Consider a vetted atime-policy remedy for flash-heavy hosts.",
  };
}

function trimFinding(report: Omit<DriveHealthReport, "findings">): Finding {
  const timerEnabled = report.trim.timer.unitFileState === "enabled";
  const timerActive = report.trim.timer.activeState === "active";
  const dryRunEntries = report.trim.dryRun.entries.length;
  const discard = advertisedDiscard(report.blockDevices);

  if (discard === "supported" && dryRunEntries > 0) {
    return {
      id: "trim-support",
      severity: timerEnabled && timerActive ? "ok" : "opportunity",
      title: "TRIM support and schedule",
      summary: timerEnabled && timerActive
        ? "Discard support is advertised and fstrim.timer is active."
        : "Discard support is advertised, but fstrim.timer is not confirmed active.",
      evidence: {
        advertisedDiscard: discard,
        dryRunEntries,
        timerState: report.trim.timer.unitFileState,
        activeState: report.trim.timer.activeState,
      },
      recommendation: timerEnabled && timerActive ? undefined : "Enable periodic fstrim after verifying compatibility.",
    };
  }

  if (timerEnabled || timerActive) {
    return {
      id: "trim-support",
      severity: "warning",
      title: "TRIM support and schedule",
      summary: "fstrim.timer is present, but discard support or dry-run output is not confirmed.",
      evidence: {
        advertisedDiscard: discard,
        dryRunEntries,
        dryRunMessage: report.trim.dryRun.message,
        timerState: report.trim.timer.unitFileState,
        activeState: report.trim.timer.activeState,
      },
      recommendation: "Treat the timer separately from actual discard capability; inspect the block stack before relying on TRIM.",
    };
  }

  return {
    id: "trim-support",
    severity: discard === "supported" ? "opportunity" : "unsupported",
    title: "TRIM support and schedule",
    summary: discard === "supported"
      ? "Discard support is advertised, but fstrim.timer is not enabled and active."
      : "Discard support was not advertised by collected block-device data.",
    evidence: {
      advertisedDiscard: discard,
      dryRunEntries,
      timerState: report.trim.timer.unitFileState,
      activeState: report.trim.timer.activeState,
    },
  };
}

function smartctlFinding(tools: ToolAvailability[]): Finding {
  const smartctl = tools.find((tool) => tool.command === "smartctl");
  if (smartctl?.installed) {
    return {
      id: "smartctl-availability",
      severity: "info",
      title: "SMART diagnostics availability",
      summary: "smartctl is installed; deeper SMART collection can run when supported by the drive bridge.",
      evidence: { path: smartctl.path },
    };
  }

  return {
    id: "smartctl-availability",
    severity: "unsupported",
    title: "SMART diagnostics availability",
    summary: "smartctl is not installed, so SMART health is reported as unsupported rather than fatal.",
    evidence: {
      packageAvailable: smartctl?.packageAvailable,
      candidateVersion: smartctl?.candidateVersion,
    },
    recommendation: smartctl?.installHint,
  };
}

function journaldFinding(report: Omit<DriveHealthReport, "findings">): Finding {
  const persistent = report.journald.persistentDirectoryPresent || report.journald.storageMode === "persistent";
  const usage = report.journald.diskUsageBytes ?? 0;

  return {
    id: "journald-footprint",
    severity: persistent && usage > 256 * 1024 ** 2 ? "opportunity" : "info",
    title: "Journald footprint",
    summary: persistent
      ? `Persistent journald is present and uses ${formatBytes(report.journald.diskUsageBytes)}.`
      : `Journald storage mode is ${report.journald.storageMode}.`,
    evidence: {
      storageMode: report.journald.storageMode,
      persistentDirectoryPresent: report.journald.persistentDirectoryPresent,
      diskUsageBytes: report.journald.diskUsageBytes,
    },
    recommendation: persistent ? "Consider a bounded journald size policy for flash-heavy hosts." : undefined,
  };
}

function swapFinding(report: Omit<DriveHealthReport, "findings">): Finding {
  if (report.swap.diskBackedSwapActive) {
    return {
      id: "swap-mode",
      severity: "opportunity",
      title: "Swap mode",
      summary: "Disk-backed swap is active.",
      evidence: {
        devices: report.swap.devices,
        swappiness: report.swap.swappiness,
        zramDevices: report.swap.zramDevices.length,
      },
      recommendation: "For flash-heavy hosts, evaluate zram or reduced disk-backed swap with explicit memory-risk notes.",
    };
  }

  return {
    id: "swap-mode",
    severity: report.swap.zramDevices.length > 0 ? "ok" : "info",
    title: "Swap mode",
    summary: report.swap.zramDevices.length > 0 ? "zram swap is active." : "No disk-backed swap was detected.",
    evidence: {
      devices: report.swap.devices,
      swappiness: report.swap.swappiness,
      zramDevices: report.swap.zramDevices.length,
    },
  };
}

function packageCacheFinding(report: Omit<DriveHealthReport, "findings">): Finding {
  const cache = report.directoryUsage.find((entry) => entry.path === "/var/cache/apt");
  if (!cache || cache.status !== "ok") {
    return {
      id: "package-cache-footprint",
      severity: "unsupported",
      title: "Package cache footprint",
      summary: "Package cache size was not collected.",
      evidence: { status: cache?.status, message: cache?.message },
      recommendation: "Measure /var/cache/apt before deciding whether cleanup is worthwhile.",
    };
  }

  const large = (cache.sizeBytes ?? 0) > 512 * 1024 ** 2;
  return {
    id: "package-cache-footprint",
    severity: large ? "opportunity" : "info",
    title: "Package cache footprint",
    summary: `Apt cache uses ${formatBytes(cache.sizeBytes)}.`,
    evidence: { path: cache.path, sizeBytes: cache.sizeBytes },
    recommendation: large ? "Use apt's own cache cleanup commands after package-manager activity is idle." : undefined,
  };
}

function piUsbFlashProfileFinding(report: Omit<DriveHealthReport, "findings">): Finding {
  const root = report.filesystems.find((filesystem) => filesystem.target === report.target) ?? report.filesystems.find((filesystem) => filesystem.target === "/");
  const rootOptions = root?.options ?? [];
  const aptCache = report.directoryUsage.find((entry) => entry.path === "/var/cache/apt");
  const checks = {
    rootNoatime: rootOptions.includes("noatime"),
    trimVerified: report.trim.advertisedDiscard === "supported" && report.trim.dryRun.entries.length > 0,
    fstrimScheduled: report.trim.timer.unitFileState === "enabled" && report.trim.timer.activeState === "active",
    journaldBounded: !report.journald.persistentDirectoryPresent || (report.journald.diskUsageBytes ?? 0) <= 256 * 1024 ** 2,
    lowWriteSwap: report.swap.zramDevices.length > 0 || !report.swap.diskBackedSwapActive,
    aptCacheBounded: aptCache?.status === "ok" && (aptCache.sizeBytes ?? 0) <= 512 * 1024 ** 2,
  };
  const reviewItems = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return {
    id: "pi-usb-flash-low-write-profile",
    severity: reviewItems.length === 0 ? "ok" : reviewItems.length <= 2 ? "opportunity" : "warning",
    title: "Pi USB flash low-write profile",
    summary: reviewItems.length === 0
      ? "The collected checks match the low-write Pi USB flash profile."
      : `Review ${reviewItems.length} low-write profile item(s): ${reviewItems.join(", ")}.`,
    evidence: {
      checks,
      rootOptions,
      journaldDiskUsageBytes: report.journald.diskUsageBytes,
      zramDevices: report.swap.zramDevices.length,
      diskBackedSwapActive: report.swap.diskBackedSwapActive,
      aptCacheBytes: aptCache?.sizeBytes,
    },
    recommendation: "Prefer image-time choices for atime, journald policy, zram posture, and cache cleanup; use post-boot checks to verify fstrim support and timer state.",
  };
}
