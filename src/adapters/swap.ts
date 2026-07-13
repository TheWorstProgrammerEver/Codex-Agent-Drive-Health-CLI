import { readFile } from "node:fs/promises";
import { type CommandRunner } from "./command.js";
import { parseJson, sourceFromCommand, statusFromCommand } from "./outcome.js";
import { toNumber } from "./bytes.js";
import type { SourceRecord, SwapDevice, SwapReport, ZramDevice } from "../report/model.js";

interface RawZramctl {
  zramctl?: Array<Record<string, unknown>>;
}

export interface SwapCollection {
  swap: SwapReport;
  sources: SourceRecord[];
}

export async function collectSwap(runner: CommandRunner): Promise<SwapCollection> {
  const sources: SourceRecord[] = [];
  const swapon = await runner.run("swapon", ["--show", "--bytes", "--output", "NAME,TYPE,SIZE,USED,PRIO"], {
    timeoutMs: 7000,
  });
  const swaponStatus = statusFromCommand(swapon);
  const devices = swaponStatus === "ok" ? parseSwapon(swapon.stdout) : [];
  sources.push(sourceFromCommand("swapon", swapon, swaponStatus, swaponStatus === "ok" ? undefined : swapon.stderr.trim()));

  const zram = await collectZramDevices(runner, sources);

  const swappiness = await readIntegerFile("/proc/sys/vm/swappiness", "vm.swappiness", sources);
  const zswapEnabled = await readBooleanFile("/sys/module/zswap/parameters/enabled", "zswap.enabled", sources);

  return {
    swap: {
      devices,
      diskBackedSwapActive: devices.some((device) => device.type === "file" || device.type === "partition"),
      zramDevices: zram,
      zswapEnabled,
      swappiness,
      status: swaponStatus === "unsupported" ? "unsupported" : "ok",
      message: swaponStatus === "ok" ? undefined : swapon.stderr.trim(),
    },
    sources,
  };
}

export function parseSwapon(stdout: string): SwapDevice[] {
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, type, size, used, priority] = line.split(/\s+/);

      return {
        name,
        type,
        sizeBytes: toNumber(size),
        usedBytes: toNumber(used),
        priority: priority === undefined ? undefined : Number.parseInt(priority, 10),
      } satisfies SwapDevice;
    });
}

export function parseZramctl(stdout: string): ZramDevice[] {
  const parsed = parseJson<RawZramctl>(stdout);
  if (parsed.status !== "ok" || !Array.isArray(parsed.value?.zramctl)) {
    return [];
  }

  return parsed.value.zramctl.map((device) => ({
    name: String(device.name ?? "unknown"),
    diskSizeBytes: toNumber(device.disksize),
    dataBytes: toNumber(device.data),
    compressedBytes: toNumber(device.compr),
    algorithm: typeof device.algorithm === "string" ? device.algorithm : undefined,
  }));
}

export function parseZramctlTable(stdout: string): ZramDevice[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, diskSize, data, compressed, algorithm] = line.split(/\s+/);

      return {
        name,
        diskSizeBytes: toNumber(diskSize),
        dataBytes: toNumber(data),
        compressedBytes: toNumber(compressed),
        algorithm,
      } satisfies ZramDevice;
    });
}

async function collectZramDevices(runner: CommandRunner, sources: SourceRecord[]): Promise<ZramDevice[]> {
  const json = await runner.run("zramctl", ["--json", "--output-all", "--bytes"], { timeoutMs: 7000 });
  const jsonStatus = statusFromCommand(json);

  if (jsonStatus === "ok") {
    sources.push(sourceFromCommand("zramctl:json", json, "ok"));
    return parseZramctl(json.stdout);
  }

  const unsupportedJson = json.stderr.includes("unrecognized option") || json.stderr.includes("invalid option");
  sources.push(
    sourceFromCommand(
      "zramctl:json",
      json,
      unsupportedJson ? "unsupported" : jsonStatus,
      json.stderr.trim(),
    ),
  );

  if (jsonStatus === "unsupported") {
    return [];
  }

  const table = await runner.run(
    "zramctl",
    ["--bytes", "--noheadings", "--output", "NAME,DISKSIZE,DATA,COMPR,ALGORITHM"],
    { timeoutMs: 7000 },
  );
  const tableStatus = statusFromCommand(table);
  sources.push(sourceFromCommand("zramctl:table", table, tableStatus, tableStatus === "ok" ? undefined : table.stderr.trim()));

  return tableStatus === "ok" ? parseZramctlTable(table.stdout) : [];
}

async function readIntegerFile(path: string, id: string, sources: SourceRecord[]): Promise<number | undefined> {
  try {
    const value = Number.parseInt((await readFile(path, "utf8")).trim(), 10);
    sources.push({ id, kind: "file", path, status: "ok" });
    return Number.isFinite(value) ? value : undefined;
  } catch (error) {
    sources.push({
      id,
      kind: "file",
      path,
      status: "unsupported",
      message: error instanceof Error ? error.message : "Unable to read kernel setting.",
    });
    return undefined;
  }
}

async function readBooleanFile(path: string, id: string, sources: SourceRecord[]): Promise<boolean | undefined> {
  try {
    const value = (await readFile(path, "utf8")).trim().toLowerCase();
    sources.push({ id, kind: "file", path, status: "ok" });
    return value === "1" || value === "y" || value === "yes" || value === "true";
  } catch (error) {
    sources.push({
      id,
      kind: "file",
      path,
      status: "unsupported",
      message: error instanceof Error ? error.message : "Unable to read kernel setting.",
    });
    return undefined;
  }
}
