import { type CommandRunner } from "./command.js";
import { parseJson, sourceFromCommand, statusFromCommand } from "./outcome.js";
import { toNumber } from "./bytes.js";
import type { BlockDevice, SourceRecord } from "../report/model.js";

interface RawLsblk {
  blockdevices?: RawBlockDevice[];
}

interface RawBlockDevice {
  name?: string;
  kname?: string;
  type?: string;
  size?: number | string;
  model?: string | null;
  vendor?: string | null;
  tran?: string | null;
  rm?: boolean | number;
  rota?: boolean | number;
  mountpoint?: string | null;
  mountpoints?: Array<string | null> | string | null;
  fstype?: string | null;
  fsver?: string | null;
  label?: string | null;
  uuid?: string | null;
  partuuid?: string | null;
  pkname?: string | null;
  "disc-gran"?: number | string;
  "disc-max"?: number | string;
  "disc-zero"?: boolean | number | string;
  children?: RawBlockDevice[];
}

export interface BlockDeviceCollection {
  devices: BlockDevice[];
  sources: SourceRecord[];
}

const INVENTORY_COLUMNS = [
  "NAME", "KNAME", "TYPE", "SIZE", "MODEL", "VENDOR", "TRAN", "RM",
  "ROTA", "MOUNTPOINTS", "FSTYPE", "FSVER", "LABEL", "UUID", "PARTUUID", "PKNAME",
];
const DISCARD_COLUMNS = ["NAME", "KNAME", "DISC-GRAN", "DISC-MAX", "DISC-ZERO"];

export async function collectBlockDevices(runner: CommandRunner): Promise<BlockDeviceCollection> {
  const inventory = await runner.run("lsblk", ["--json", "--bytes", "--output", INVENTORY_COLUMNS.join(",")], {
    timeoutMs: 7000,
  });
  const inventoryStatus = statusFromCommand(inventory);
  const sources: SourceRecord[] = [];

  if (inventoryStatus !== "ok") {
    sources.push(sourceFromCommand("lsblk:inventory", inventory, inventoryStatus, inventory.stderr.trim()));
    return { devices: [], sources };
  }

  const parsedInventory = parseLsblkDevices(inventory.stdout);
  if (parsedInventory.status !== "ok" || !parsedInventory.devices) {
    sources.push(sourceFromCommand("lsblk:inventory", inventory, "parse-error", parsedInventory.message));
    return { devices: [], sources };
  }

  sources.push(sourceFromCommand("lsblk:inventory", inventory, "ok"));
  const devices = parsedInventory.devices;

  const discard = await runner.run("lsblk", ["--json", "--bytes", "--discard", "--output", DISCARD_COLUMNS.join(",")], {
    timeoutMs: 7000,
  });
  const discardStatus = statusFromCommand(discard);
  if (discardStatus !== "ok") {
    sources.push(sourceFromCommand("lsblk:discard", discard, discardStatus, discard.stderr.trim()));
    return { devices, sources };
  }

  const parsedDiscard = parseLsblkDevices(discard.stdout);
  if (parsedDiscard.status !== "ok" || !parsedDiscard.devices) {
    sources.push(sourceFromCommand("lsblk:discard", discard, "parse-error", parsedDiscard.message));
    return { devices, sources };
  }

  mergeDiscardFields(devices, parsedDiscard.devices);
  sources.push(sourceFromCommand("lsblk:discard", discard, "ok"));

  return { devices, sources };
}

export function parseLsblkDevices(stdout: string): {
  status: "ok" | "parse-error";
  devices?: BlockDevice[];
  message?: string;
} {
  const parsed = parseJson<RawLsblk>(stdout);
  if (parsed.status !== "ok" || !parsed.value) {
    return { status: "parse-error", message: parsed.message };
  }

  if (!Array.isArray(parsed.value.blockdevices)) {
    return { status: "parse-error", message: "lsblk JSON did not include a blockdevices array." };
  }

  return {
    status: "ok",
    devices: parsed.value.blockdevices.flatMap((device) => normalizeDevice(device)),
  };
}

export function advertisedDiscard(devices: BlockDevice[]): "supported" | "not-advertised" | "unknown" {
  const values = devices.flatMap((device) => [device.discardGranularityBytes, device.discardMaxBytes]);

  if (values.length === 0 || values.every((value) => value === undefined)) {
    return "unknown";
  }

  return values.some((value) => (value ?? 0) > 0) ? "supported" : "not-advertised";
}

function normalizeDevice(device: RawBlockDevice, parentKernelName?: string): BlockDevice[] {
  const current: BlockDevice = {
    name: device.name ?? device.kname ?? "unknown",
    kernelName: device.kname,
    parentKernelName: device.pkname ?? parentKernelName,
    type: device.type,
    sizeBytes: toNumber(device.size),
    model: trimOrUndefined(device.model),
    vendor: trimOrUndefined(device.vendor),
    transport: trimOrUndefined(device.tran),
    removable: toBoolean(device.rm),
    rotational: toBoolean(device.rota),
    mountpoints: normalizeMountpoints(device),
    filesystemType: trimOrUndefined(device.fstype),
    filesystemVersion: trimOrUndefined(device.fsver),
    label: trimOrUndefined(device.label),
    uuid: trimOrUndefined(device.uuid),
    partuuid: trimOrUndefined(device.partuuid),
    discardGranularityBytes: toNumber(device["disc-gran"]),
    discardMaxBytes: toNumber(device["disc-max"]),
    discardZeroesData: toBoolean(device["disc-zero"]),
  };

  const children = device.children?.flatMap((child) => normalizeDevice(child, device.kname ?? parentKernelName)) ?? [];
  return [current, ...children];
}

function normalizeMountpoints(device: RawBlockDevice): string[] {
  if (Array.isArray(device.mountpoints)) {
    return device.mountpoints.filter((value): value is string => Boolean(value));
  }

  const mountpoint = typeof device.mountpoints === "string" ? device.mountpoints : device.mountpoint;
  return typeof mountpoint === "string" ? [mountpoint] : [];
}

function mergeDiscardFields(devices: BlockDevice[], discardDevices: BlockDevice[]): void {
  const byKernelName = new Map(discardDevices.map((device) => [device.kernelName ?? device.name, device]));

  for (const device of devices) {
    const discard = byKernelName.get(device.kernelName ?? device.name);
    if (!discard) {
      continue;
    }

    device.discardGranularityBytes = discard.discardGranularityBytes;
    device.discardMaxBytes = discard.discardMaxBytes;
    device.discardZeroesData = discard.discardZeroesData;
  }
}

function trimOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toBoolean(value: boolean | number | string | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    return value === "1" || value.toLowerCase() === "true";
  }

  return undefined;
}
