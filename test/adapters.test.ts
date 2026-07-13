import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { parseLsblkDevices, advertisedDiscard } from "../src/adapters/lsblk.js";
import { parseFindmnt } from "../src/adapters/findmnt.js";
import { parseFstrimDryRun } from "../src/adapters/fstrim.js";
import { parseJournalDiskUsage } from "../src/adapters/journald.js";
import { parseSwapon, parseZramctlTable } from "../src/adapters/swap.js";
import { parseAptPolicy } from "../src/adapters/toolAvailability.js";
import { statusFromCommand } from "../src/adapters/outcome.js";

test("lsblk parser handles zero discard fields", () => {
  const parsed = parseLsblkDevices(fixture("lsblk-discard-zero.json"));

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.devices?.length, 3);
  assert.equal(advertisedDiscard(parsed.devices ?? []), "not-advertised");
  assert.equal(parsed.devices?.find((device) => device.name === "sda2")?.mountpoints[0], "/");
});

test("lsblk parser reports parse failures", () => {
  const parsed = parseLsblkDevices(fixture("invalid-json.txt"));

  assert.equal(parsed.status, "parse-error");
  assert.match(parsed.message ?? "", /JSON/);
});

test("findmnt parser flattens nested mounts and mount options", () => {
  const parsed = parseFindmnt(fixture("findmnt-daedalus.json"));

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.mounts?.length, 2);
  assert.deepEqual(parsed.mounts?.find((mount) => mount.target === "/")?.options, ["rw", "noatime"]);
});

test("fstrim dry-run parser handles verbose filesystem output", () => {
  const parsed = parseFstrimDryRun(fixture("fstrim-success.txt"));

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].target, "/");
  assert.equal(parsed.entries[0].bytes, 1288490188);
});

test("fstrim dry-run parser treats empty output as inconclusive success", () => {
  const parsed = parseFstrimDryRun("");

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.entries.length, 0);
  assert.match(parsed.message ?? "", /no filesystem output/i);
});

test("journalctl disk-usage parser converts human units", () => {
  assert.equal(parseJournalDiskUsage(fixture("journal-disk-usage.txt")), 401604608);
});

test("swapon parser identifies disk-backed swap files", () => {
  const devices = parseSwapon(fixture("swapon-disk-file.txt"));

  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, "/var/swap");
  assert.equal(devices[0].type, "file");
  assert.equal(devices[0].sizeBytes, 209715200);
});

test("zramctl table parser handles older util-linux output", () => {
  const devices = parseZramctlTable("/dev/zram0 268435456 1024 512 zstd\n");

  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, "/dev/zram0");
  assert.equal(devices[0].diskSizeBytes, 268435456);
  assert.equal(devices[0].algorithm, "zstd");
});

test("apt-cache parser reports installable missing packages", () => {
  const policy = parseAptPolicy("smartmontools", fixture("apt-cache-smartmontools.txt"));

  assert.equal(policy.available, true);
  assert.equal(policy.candidateVersion, "7.3-1+b1");
});

test("command status classifier treats missing commands as unsupported", () => {
  const status = statusFromCommand({
    command: "smartctl",
    args: ["--json"],
    exitCode: null,
    stdout: "",
    stderr: "spawn smartctl ENOENT",
    errorCode: "ENOENT",
  });

  assert.equal(status, "unsupported");
});

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "test", "fixtures", "adapters", name), "utf8");
}
