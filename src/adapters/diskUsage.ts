import { type CommandRunner } from "./command.js";
import { toNumber } from "./bytes.js";
import { sourceFromCommand, statusFromCommand } from "./outcome.js";
import type { DirectoryUsage, DiskUsage, SourceRecord } from "../report/model.js";

export interface DiskUsageCollection {
  diskUsage: DiskUsage[];
  directoryUsage: DirectoryUsage[];
  sources: SourceRecord[];
}

const HOTSPOT_PATHS = ["/var/log", "/var/cache/apt", "/tmp"];

export async function collectDiskUsage(runner: CommandRunner): Promise<DiskUsageCollection> {
  const sources: SourceRecord[] = [];
  const df = await runner.run(
    "df",
    ["-B1", "--output=source,fstype,size,used,avail,pcent,target"],
    { timeoutMs: 7000 },
  );
  const dfStatus = statusFromCommand(df);
  const diskUsage = dfStatus === "ok" ? parseDf(df.stdout) : [];
  sources.push(sourceFromCommand("df", df, dfStatus, dfStatus === "ok" ? undefined : df.stderr.trim()));

  const du = await runner.run("du", ["-sb", ...HOTSPOT_PATHS], { timeoutMs: 10000 });
  const duStatus = statusFromCommand(du);
  const directoryUsage = duStatus === "unsupported" ? unsupportedDirectoryUsage() : parseDu(du.stdout, du.stderr);
  sources.push(sourceFromCommand("du:hotspots", du, duStatus, duStatus === "ok" ? undefined : du.stderr.trim()));

  return { diskUsage, directoryUsage, sources };
}

export function parseDf(stdout: string): DiskUsage[] {
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line.split(/\s+/);
      const [source, filesystemType, size, used, available, percent, ...targetParts] = columns;

      return {
        source,
        filesystemType,
        sizeBytes: toNumber(size),
        usedBytes: toNumber(used),
        availableBytes: toNumber(available),
        usePercent: parsePercent(percent),
        target: targetParts.join(" ") || "unknown",
      } satisfies DiskUsage;
    });
}

export function parseDu(stdout: string, stderr = ""): DirectoryUsage[] {
  const byPath = new Map<string, DirectoryUsage>();

  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) {
      continue;
    }
    byPath.set(match[2], {
      path: match[2],
      sizeBytes: Number.parseInt(match[1], 10),
      status: "ok",
    });
  }

  for (const path of HOTSPOT_PATHS) {
    if (!byPath.has(path)) {
      byPath.set(path, {
        path,
        status: stderr ? "error" : "unsupported",
        message: stderr || "No size was reported for this path.",
      });
    }
  }

  return [...byPath.values()];
}

function unsupportedDirectoryUsage(): DirectoryUsage[] {
  return HOTSPOT_PATHS.map((path) => ({
    path,
    status: "unsupported",
    message: "du is not available.",
  }));
}

function parsePercent(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

