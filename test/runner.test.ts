import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ON_CALENDAR,
  DEFAULT_RANDOMIZED_DELAY,
  DEFAULT_USER_STATE_DIR,
  RUNNER_SERVICE_NAME,
  RUNNER_TIMER_NAME,
  installRunner,
  inspectRunner,
  renderExampleServiceUnit,
  renderExampleTimerUnit,
  uninstallRunner,
  unitDirectory,
} from "../src/runner/systemd.js";
import { reportsDir, writeReport } from "../src/state/reports.js";
import type { DriveHealthReport } from "../src/report/model.js";

test("systemd examples use host-neutral placeholders and read-only check command", () => {
  const service = renderExampleServiceUnit();
  const timer = renderExampleTimerUnit();

  assert.match(service, /__DRIVE_HEALTH_BIN_ABSOLUTE_PATH__/);
  assert.match(service, /__DRIVE_HEALTH_STATE_DIR__/);
  assert.match(service, / check --profile pi-usb-flash --write-report --quiet /);
  assert.match(service, /--retention-count 30/);
  assert.doesNotMatch(service, /\bapply\b/);
  assert.doesNotMatch(service, /--include-identifiers/);
  assert.doesNotMatch(service, /\/home\/daedalus/);
  assert.match(timer, /OnCalendar=daily/);
  assert.match(timer, /Persistent=true/);
});

test("report writer keeps retention bounded and removes stale reports", async () => {
  const root = makeTempRoot("drive-health-runner-retention-");
  try {
    const stateDir = join(root, "state");

    await writeReport({ stateDir, report: sampleReport("first"), retentionCount: 2, now: new Date("2026-07-13T00:00:00.000Z") });
    await writeReport({ stateDir, report: sampleReport("second"), retentionCount: 2, now: new Date("2026-07-13T00:01:00.000Z") });
    const third = await writeReport({ stateDir, report: sampleReport("third"), retentionCount: 2, now: new Date("2026-07-13T00:02:00.000Z") });

    const files = readdirSync(reportsDir(stateDir)).sort();
    assert.deepEqual(files, ["check-20260713T000100Z.json", "check-20260713T000200Z.json"]);
    assert.equal(third.removedReports.length, 1);
    assert.match(readFileSync(join(reportsDir(stateDir), files[1]), "utf8"), /third/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runner install writes units under temp root and doctor detects stale and invalid files", async () => {
  const root = makeTempRoot("drive-health-runner-install-");
  try {
    const fakeBin = join(root, "usr/local/bin/drive-health");
    const fakeSystemctl = join(root, "bin/systemctl");
    mkdirSync(join(root, "usr/local/bin"), { recursive: true });
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(fakeBin, "#!/bin/sh\nexit 0\n", "utf8");
    writeFileSync(fakeSystemctl, "#!/bin/sh\nexit 0\n", "utf8");
    chmodSync(fakeBin, 0o755);
    chmodSync(fakeSystemctl, 0o755);

    const dryRun = await installRunner({
      scope: "user",
      rootDir: root,
      dryRun: true,
      binPath: "/usr/local/bin/drive-health",
      stateDir: DEFAULT_USER_STATE_DIR,
      profile: "pi-usb-flash",
      retentionCount: 7,
      onCalendar: DEFAULT_ON_CALENDAR,
      randomizedDelaySec: DEFAULT_RANDOMIZED_DELAY,
    });
    assert.equal(existsSync(dryRun.servicePath), false);

    const installed = await installRunner({
      scope: "user",
      rootDir: root,
      dryRun: false,
      binPath: "/usr/local/bin/drive-health",
      stateDir: DEFAULT_USER_STATE_DIR,
      profile: "pi-usb-flash",
      retentionCount: 7,
      onCalendar: DEFAULT_ON_CALENDAR,
      randomizedDelaySec: DEFAULT_RANDOMIZED_DELAY,
    });
    assert.deepEqual(installed.filesWritten, [
      join(unitDirectory(root, "user"), RUNNER_SERVICE_NAME),
      join(unitDirectory(root, "user"), RUNNER_TIMER_NAME),
    ]);

    const ok = await inspectRunner({ scope: "user", rootDir: root, pathEnv: join(root, "bin") });
    assert.equal(ok.status, "ok");
    assert.equal(ok.service.status, "ok");
    assert.equal(ok.timer.status, "ok");

    const staleService = readFileSync(installed.servicePath, "utf8").replace("PrivateTmp=yes\n", "");
    writeFileSync(installed.servicePath, staleService, "utf8");
    const stale = await inspectRunner({ scope: "user", rootDir: root, pathEnv: join(root, "bin") });
    assert.equal(stale.status, "degraded");
    assert.equal(stale.service.status, "stale");

    writeFileSync(installed.servicePath, staleService.replace(" check ", " apply "), "utf8");
    const invalid = await inspectRunner({ scope: "user", rootDir: root, pathEnv: join(root, "bin") });
    assert.equal(invalid.status, "degraded");
    assert.equal(invalid.service.status, "invalid");
    assert.match(invalid.service.issues.join("\n"), /must invoke drive-health check/);

    const uninstalled = await uninstallRunner({ scope: "user", rootDir: root, dryRun: false });
    assert.deepEqual(uninstalled.filesRemoved.sort(), [installed.servicePath, installed.timerPath].sort());
    assert.equal(existsSync(installed.servicePath), false);
    assert.equal(existsSync(installed.timerPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(prefix: string): string {
  const root = join(tmpdir(), `${prefix}${process.pid}-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

function sampleReport(hostname: string): DriveHealthReport {
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
    host: { hostname },
    tools: [],
    blockDevices: [],
    filesystems: [],
    diskUsage: [],
    directoryUsage: [],
    trim: {
      timer: { unit: "fstrim.timer", status: "ok" },
      advertisedDiscard: "unknown",
      dryRun: { status: "ok", entries: [] },
    },
    journald: {
      storageMode: "auto",
      persistentDirectoryPresent: false,
      status: "ok",
    },
    swap: {
      devices: [],
      diskBackedSwapActive: false,
      zramDevices: [],
      status: "ok",
    },
    findings: [],
    sources: [],
  };
}
