import test from "node:test";
import assert from "node:assert/strict";
import { buildFindings } from "../src/report/findings.js";
import type { DriveHealthReport } from "../src/report/model.js";

test("Daedalus validation shape is representable in findings", () => {
  const report = daedalusReport();
  const findings = buildFindings(report);

  assert.equal(findings.find((finding) => finding.id === "root-atime-policy")?.severity, "ok");
  assert.equal(findings.find((finding) => finding.id === "trim-support")?.severity, "warning");
  assert.equal(findings.find((finding) => finding.id === "smartctl-availability")?.severity, "unsupported");
  assert.equal(findings.find((finding) => finding.id === "journald-footprint")?.severity, "opportunity");
  assert.equal(findings.find((finding) => finding.id === "swap-mode")?.severity, "opportunity");
  assert.equal(findings.find((finding) => finding.id === "package-cache-footprint")?.severity, "unsupported");
});

test("Pi USB flash profile summarizes low-write boot posture", () => {
  const findings = buildFindings({
    ...daedalusReport(),
    profile: "pi-usb-flash",
    directoryUsage: [
      { path: "/var/cache/apt", sizeBytes: 640 * 1024 ** 2, status: "ok" },
    ],
  });
  const profile = findings.find((finding) => finding.id === "pi-usb-flash-low-write-profile");

  assert.equal(profile?.severity, "warning");
  assert.match(profile?.summary ?? "", /low-write profile item/);
  assert.match(profile?.recommendation ?? "", /image-time choices/);
});

function daedalusReport(): Omit<DriveHealthReport, "findings"> {
  return {
    schemaVersion: "drive-health.report.v1",
    generatedAt: "2026-07-11T00:00:00.000Z",
    target: "/",
    profile: "auto",
    redaction: {
      identifiersIncluded: false,
      redacted: true,
      rules: [],
    },
    host: {
      osName: "Debian GNU/Linux 12 (bookworm)",
      kernelRelease: "6.6.31+rpt-rpi-2712",
      architecture: "aarch64",
    },
    tools: [
      {
        name: "smartctl",
        command: "smartctl",
        packageName: "smartmontools",
        installed: false,
        packageAvailable: true,
        candidateVersion: "7.3-1+b1",
        installHint: "Install package 'smartmontools' to enable smartctl.",
        status: "missing",
      },
    ],
    blockDevices: [
      {
        name: "sda2",
        type: "part",
        mountpoints: ["/"],
        filesystemType: "ext4",
        discardGranularityBytes: 0,
        discardMaxBytes: 0,
      },
    ],
    filesystems: [
      {
        target: "/",
        source: "/dev/sda2",
        filesystemType: "ext4",
        options: ["rw", "noatime"],
      },
    ],
    diskUsage: [],
    directoryUsage: [],
    trim: {
      timer: {
        unit: "fstrim.timer",
        loadState: "loaded",
        unitFileState: "enabled",
        activeState: "active",
        status: "ok",
      },
      advertisedDiscard: "not-advertised",
      dryRun: {
        status: "ok",
        entries: [],
        message: "Dry-run completed but produced no filesystem output.",
      },
    },
    journald: {
      storageMode: "auto",
      persistentDirectoryPresent: true,
      diskUsageBytes: 401604608,
      status: "ok",
    },
    swap: {
      devices: [
        {
          name: "/var/swap",
          type: "file",
          sizeBytes: 209715200,
          usedBytes: 0,
        },
      ],
      diskBackedSwapActive: true,
      zramDevices: [],
      swappiness: 60,
      status: "ok",
    },
    sources: [],
  };
}
