import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { applyRemedy } from "../src/remedies/apply.js";
import { renderApplyResult } from "../src/remedies/render.js";
import { selectRemedySuggestions } from "../src/remedies/selection.js";
import { parseApplyOptions } from "../src/commands/options.js";
import { buildFindings } from "../src/report/findings.js";
import type { CommandResult, CommandRunner } from "../src/adapters/command.js";
import type { DriveHealthReport } from "../src/report/model.js";

test("remedy selection marks high-write findings as recommended", () => {
  const suggestions = selectRemedySuggestions(reportWithFindings(baseReport()));
  const byId = new Map(suggestions.map((suggestion) => [suggestion.remedy.id, suggestion]));

  assert.equal(byId.get("enable-weekly-fstrim")?.status, "recommended");
  assert.equal(byId.get("limit-journald-disk-usage")?.status, "recommended");
  assert.equal(byId.get("prefer-zram-over-disk-swap")?.status, "recommended");
  assert.equal(byId.get("clean-package-cache")?.status, "recommended");
  assert.equal(byId.get("audit-large-log-writers")?.status, "recommended");
  assert.equal(byId.get("set-root-noatime")?.status, "already-applied");

  const lastRecommended = Math.max(...suggestions.map((suggestion, index) => suggestion.status === "recommended" ? index : -1));
  const firstAlreadyApplied = suggestions.findIndex((suggestion) => suggestion.status === "already-applied");
  assert.ok(lastRecommended < firstAlreadyApplied);
});

test("advisory warning suggestions rank above advisory info suggestions", () => {
  const report = reportWithFindings({
    ...baseReport(),
    trim: {
      timer: {
        unit: "fstrim.timer",
        loadState: "loaded",
        unitFileState: "enabled",
        activeState: "active",
        status: "ok",
      },
      advertisedDiscard: "supported",
      dryRun: {
        status: "ok",
        entries: [],
        message: "Dry-run completed but produced no filesystem output.",
      },
    },
    journald: {
      storageMode: "auto",
      persistentDirectoryPresent: true,
      diskUsageBytes: 64 * 1024 ** 2,
      status: "ok",
    },
    directoryUsage: [
      { path: "/var/log", sizeBytes: 64 * 1024 ** 2, status: "ok" },
      { path: "/var/cache/apt", sizeBytes: 64 * 1024 ** 2, status: "ok" },
      { path: "/tmp", sizeBytes: 1024, status: "ok" },
    ],
  });
  const suggestions = selectRemedySuggestions(report);

  const fstrimIndex = suggestions.findIndex((suggestion) => suggestion.remedy.id === "enable-weekly-fstrim");
  const journaldIndex = suggestions.findIndex((suggestion) => suggestion.remedy.id === "limit-journald-disk-usage");

  assert.equal(suggestions[fstrimIndex].status, "advisory");
  assert.equal(suggestions[fstrimIndex].severity, "warning");
  assert.equal(suggestions[journaldIndex].status, "advisory");
  assert.equal(suggestions[journaldIndex].severity, "info");
  assert.ok(fstrimIndex < journaldIndex);
});

test("apply options default to dry-run and require --yes for execution", () => {
  assert.deepEqual(parseApplyOptions(["limit-journald-disk-usage"]), {
    remedyId: "limit-journald-disk-usage",
    dryRun: true,
    yes: false,
    profile: "auto",
  });
  assert.deepEqual(parseApplyOptions(["limit-journald-disk-usage", "--yes"]), {
    remedyId: "limit-journald-disk-usage",
    dryRun: false,
    yes: true,
    profile: "auto",
  });
});

test("dry-run output shows planned backups, files, and exact commands", async () => {
  const result = await applyRemedy({
    remedyId: "limit-journald-disk-usage",
    report: reportWithFindings(baseReport()),
    dryRun: true,
    confirmed: false,
    stateDir: "/tmp/drive-health-state",
    rootDir: "/tmp/fake-root",
    now: new Date("2026-07-13T00:00:00.000Z"),
  });
  const rendered = renderApplyResult(result);

  assert.equal(result.status, "dry-run");
  assert.match(rendered, /Back up current \/etc\/systemd\/journald\.conf\.d\/90-drive-health-limits\.conf/);
  assert.match(rendered, /systemd-analyze cat-config systemd\/journald\.conf/);
  assert.match(rendered, /systemctl restart systemd-journald\.service/);
  assert.deepEqual(result.filesChanged, []);
  assert.deepEqual(result.commandsRun, []);
});

test("non-dry-run engine execution requires explicit confirmation", async () => {
  const result = await applyRemedy({
    remedyId: "limit-journald-disk-usage",
    report: reportWithFindings(baseReport()),
    dryRun: false,
    confirmed: false,
    stateDir: "/tmp/drive-health-state",
    rootDir: "/tmp/fake-root",
  });

  assert.equal(result.status, "confirmation-required");
  assert.deepEqual(result.commandsRun, []);
  assert.deepEqual(result.filesChanged, []);
});

test("unsupported TRIM state degrades apply to advisory output", async () => {
  const result = await applyRemedy({
    remedyId: "enable-weekly-fstrim",
    report: reportWithFindings({
      ...baseReport(),
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
      trim: {
        timer: {
          unit: "fstrim.timer",
          loadState: "loaded",
          unitFileState: "disabled",
          activeState: "inactive",
          status: "ok",
        },
        advertisedDiscard: "not-advertised",
        dryRun: {
          status: "ok",
          entries: [],
          message: "Dry-run completed but produced no filesystem output.",
        },
      },
    }),
    dryRun: false,
    confirmed: true,
    isRoot: true,
  });

  assert.equal(result.status, "unsupported");
  assert.deepEqual(result.commandsRun, []);
  assert.deepEqual(result.filesChanged, []);
});

test("advisory remedies still render concrete dry-run review commands", async () => {
  const result = await applyRemedy({
    remedyId: "clean-package-cache",
    report: reportWithFindings(baseReport()),
    dryRun: true,
    confirmed: false,
  });
  const rendered = renderApplyResult(result);

  assert.equal(result.status, "advisory");
  assert.match(rendered, /du -sb \/var\/cache\/apt/);
  assert.match(rendered, /apt-get clean/);
  assert.match(rendered, /No direct rollback/);
  assert.deepEqual(result.commandsRun, []);
});

test("journald apply is idempotent when managed drop-in already matches", async () => {
  const root = mkdtempSync(join(tmpdir(), "drive-health-remedy-idempotent-"));
  try {
    const dropIn = join(root, "etc/systemd/journald.conf.d/90-drive-health-limits.conf");
    await mkdir(join(root, "etc/systemd/journald.conf.d"), { recursive: true });
    writeFileSync(dropIn, managedJournaldContent(), "utf8");

    const result = await applyRemedy({
      remedyId: "limit-journald-disk-usage",
      report: reportWithFindings(baseReport()),
      dryRun: false,
      confirmed: true,
      rootDir: root,
      stateDir: join(root, "state"),
      runner: fakeRunner(),
      isRoot: true,
    });

    assert.equal(result.status, "already-applied");
    assert.deepEqual(result.commandsRun, []);
    assert.deepEqual(result.filesChanged, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("journald apply writes through a temp root and records backup", async () => {
  const root = mkdtempSync(join(tmpdir(), "drive-health-remedy-apply-"));
  try {
    const dropIn = join(root, "etc/systemd/journald.conf.d/90-drive-health-limits.conf");
    await mkdir(join(root, "etc/systemd/journald.conf.d"), { recursive: true });
    writeFileSync(dropIn, "[Journal]\nSystemMaxUse=1G\n", "utf8");

    const runner = fakeRunner();
    const result = await applyRemedy({
      remedyId: "limit-journald-disk-usage",
      report: reportWithFindings(baseReport()),
      dryRun: false,
      confirmed: true,
      rootDir: root,
      stateDir: join(root, "state"),
      runner,
      isRoot: true,
      now: new Date("2026-07-13T00:00:00.000Z"),
    });

    assert.equal(result.status, "applied");
    assert.equal(readFileSync(dropIn, "utf8"), managedJournaldContent());
    assert.equal(result.filesChanged[0], "/etc/systemd/journald.conf.d/90-drive-health-limits.conf");
    assert.deepEqual(result.commandsRun, [
      "systemd-analyze cat-config systemd/journald.conf",
      "systemctl restart systemd-journald.service",
      "journalctl --disk-usage",
    ]);
    assert.ok(existsSync(result.backups[0]));
    assert.equal(readFileSync(result.backups[0], "utf8"), "[Journal]\nSystemMaxUse=1G\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function reportWithFindings(report: Omit<DriveHealthReport, "findings">): DriveHealthReport {
  return {
    ...report,
    findings: buildFindings(report),
  };
}

function baseReport(): Omit<DriveHealthReport, "findings"> {
  return {
    schemaVersion: "drive-health.report.v1",
    generatedAt: "2026-07-13T00:00:00.000Z",
    target: "/",
    profile: "pi-usb-flash",
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
    tools: [],
    blockDevices: [
      {
        name: "sda2",
        type: "part",
        mountpoints: ["/"],
        filesystemType: "ext4",
        discardGranularityBytes: 4096,
        discardMaxBytes: 1024 * 1024,
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
    directoryUsage: [
      { path: "/var/log", sizeBytes: 384 * 1024 ** 2, status: "ok" },
      { path: "/var/cache/apt", sizeBytes: 645 * 1024 ** 2, status: "ok" },
      { path: "/tmp", sizeBytes: 42 * 1024 ** 2, status: "ok" },
    ],
    trim: {
      timer: {
        unit: "fstrim.timer",
        loadState: "loaded",
        unitFileState: "disabled",
        activeState: "inactive",
        status: "ok",
      },
      advertisedDiscard: "supported",
      dryRun: {
        status: "ok",
        entries: [
          {
            target: "/",
            bytes: 1024,
            device: "/dev/sda2",
            rawSummary: "1 KiB",
          },
        ],
      },
    },
    journald: {
      storageMode: "auto",
      persistentDirectoryPresent: true,
      diskUsageBytes: 384 * 1024 ** 2,
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

function fakeRunner(): CommandRunner {
  return {
    async run(command: string, args: string[]): Promise<CommandResult> {
      return {
        command,
        args,
        exitCode: 0,
        stdout: "",
        stderr: "",
      };
    },
  };
}

function managedJournaldContent(): string {
  return `# Managed by drive-health remedy limit-journald-disk-usage.
[Journal]
SystemMaxUse=256M
SystemKeepFree=1G
RuntimeMaxUse=128M
`;
}
