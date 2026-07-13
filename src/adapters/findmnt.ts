import { type CommandRunner } from "./command.js";
import { parseJson, sourceFromCommand, statusFromCommand } from "./outcome.js";
import { toNumber } from "./bytes.js";
import type { MountInfo, SourceRecord } from "../report/model.js";

interface RawFindmnt {
  filesystems?: RawFilesystem[];
}

interface RawFilesystem {
  target?: string;
  source?: string;
  fstype?: string;
  options?: string;
  size?: number | string;
  used?: number | string;
  avail?: number | string;
  "use%"?: string | number;
  children?: RawFilesystem[];
}

export interface MountCollection {
  mounts: MountInfo[];
  sources: SourceRecord[];
}

const FINDMNT_COLUMNS = ["TARGET", "SOURCE", "FSTYPE", "OPTIONS", "SIZE", "USED", "AVAIL", "USE%"];

export async function collectMounts(runner: CommandRunner): Promise<MountCollection> {
  const result = await runner.run("findmnt", ["--json", "--bytes", "--output", FINDMNT_COLUMNS.join(",")], {
    timeoutMs: 7000,
  });
  const status = statusFromCommand(result);

  if (status !== "ok") {
    return {
      mounts: [],
      sources: [sourceFromCommand("findmnt", result, status, result.stderr.trim())],
    };
  }

  const parsed = parseFindmnt(result.stdout);
  if (parsed.status !== "ok" || !parsed.mounts) {
    return {
      mounts: [],
      sources: [sourceFromCommand("findmnt", result, "parse-error", parsed.message)],
    };
  }

  return {
    mounts: parsed.mounts,
    sources: [sourceFromCommand("findmnt", result, "ok")],
  };
}

export function parseFindmnt(stdout: string): {
  status: "ok" | "parse-error";
  mounts?: MountInfo[];
  message?: string;
} {
  const parsed = parseJson<RawFindmnt>(stdout);
  if (parsed.status !== "ok" || !parsed.value) {
    return { status: "parse-error", message: parsed.message };
  }

  if (!Array.isArray(parsed.value.filesystems)) {
    return { status: "parse-error", message: "findmnt JSON did not include a filesystems array." };
  }

  return {
    status: "ok",
    mounts: parsed.value.filesystems.flatMap((filesystem) => normalizeFilesystem(filesystem)),
  };
}

function normalizeFilesystem(filesystem: RawFilesystem): MountInfo[] {
  const current: MountInfo = {
    target: filesystem.target ?? "unknown",
    source: filesystem.source,
    filesystemType: filesystem.fstype,
    options: filesystem.options?.split(",").filter(Boolean) ?? [],
    sizeBytes: toNumber(filesystem.size),
    usedBytes: toNumber(filesystem.used),
    availableBytes: toNumber(filesystem.avail),
    usePercent: parsePercent(filesystem["use%"]),
  };

  const children = filesystem.children?.flatMap((child) => normalizeFilesystem(child)) ?? [];
  return [current, ...children];
}

function parsePercent(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

