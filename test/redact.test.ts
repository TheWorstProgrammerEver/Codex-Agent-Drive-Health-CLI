import test from "node:test";
import assert from "node:assert/strict";
import { redactReport } from "../src/report/redact.js";
import type { DriveHealthReport } from "../src/report/model.js";

test("default report redaction removes identifiers and private paths", () => {
  const report = redactReport(sampleReport(), false);
  const json = JSON.stringify(report);

  assert.equal(report.redaction.redacted, true);
  assert.doesNotMatch(json, /11111111-02/);
  assert.doesNotMatch(json, /192\.168\.1\.50/);
  assert.doesNotMatch(json, /\/home\/alice/);
  assert.doesNotMatch(json, /uid=1000/);
  assert.match(json, /\[redacted-identifier\]/);
  assert.match(json, /\/home\/\[redacted-user\]/);
  assert.match(json, /uid=\[redacted-id\]/);
});

test("identifier-inclusive report keeps local troubleshooting values", () => {
  const report = redactReport(sampleReport(), true);
  const json = JSON.stringify(report);

  assert.equal(report.redaction.identifiersIncluded, true);
  assert.match(json, /11111111-02/);
  assert.match(json, /192\.168\.1\.50/);
});

function sampleReport(): DriveHealthReport {
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
      hostname: "private-host",
    },
    tools: [],
    blockDevices: [
      {
        name: "sda2",
        mountpoints: ["/", "/home/alice/private"],
        uuid: "22222222-2222-2222-2222-222222222222",
        partuuid: "11111111-02",
      },
    ],
    filesystems: [
      {
        target: "/run/user/1000",
        options: ["uid=1000", "gid=1000"],
      },
    ],
    diskUsage: [],
    directoryUsage: [],
    trim: {
      timer: {
        unit: "fstrim.timer",
        status: "ok",
      },
      advertisedDiscard: "unknown",
      dryRun: {
        status: "ok",
        entries: [],
      },
    },
    journald: {
      storageMode: "auto",
      persistentDirectoryPresent: false,
      status: "ok",
      message: "host 192.168.1.50 wrote logs",
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
