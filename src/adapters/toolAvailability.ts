import { resolveExecutable, type CommandRunner } from "./command.js";
import { sourceFromCommand, statusFromCommand } from "./outcome.js";
import type { SourceRecord, ToolAvailability } from "../report/model.js";

export interface ToolSpec {
  name: string;
  command: string;
  packageName?: string;
}

export interface PackagePolicy {
  packageName: string;
  available: boolean;
  candidateVersion?: string;
}

export interface ToolAvailabilityResult {
  tools: ToolAvailability[];
  sources: SourceRecord[];
}

export const DEFAULT_TOOL_SPECS: ToolSpec[] = [
  { name: "lsblk", command: "lsblk", packageName: "util-linux" },
  { name: "findmnt", command: "findmnt", packageName: "util-linux" },
  { name: "df", command: "df", packageName: "coreutils" },
  { name: "du", command: "du", packageName: "coreutils" },
  { name: "fstrim", command: "fstrim", packageName: "util-linux" },
  { name: "systemctl", command: "systemctl", packageName: "systemd" },
  { name: "journalctl", command: "journalctl", packageName: "systemd" },
  { name: "swapon", command: "swapon", packageName: "util-linux" },
  { name: "zramctl", command: "zramctl", packageName: "util-linux" },
  { name: "smartctl", command: "smartctl", packageName: "smartmontools" },
  { name: "hdparm", command: "hdparm", packageName: "hdparm" },
  { name: "apt-cache", command: "apt-cache", packageName: "apt" },
];

export async function collectToolAvailability(
  runner: CommandRunner,
  specs = DEFAULT_TOOL_SPECS,
): Promise<ToolAvailabilityResult> {
  const sources: SourceRecord[] = [];
  const aptCachePath = resolveExecutable("apt-cache");
  const policies = new Map<string, PackagePolicy>();
  const packageNames = [...new Set(specs.map((spec) => spec.packageName).filter(isDefined))];

  if (aptCachePath) {
    for (const packageName of packageNames) {
      const result = await runner.run("apt-cache", ["policy", packageName], { timeoutMs: 5000 });
      const status = statusFromCommand(result);
      const parsed = status === "ok" ? parseAptPolicy(packageName, result.stdout) : undefined;
      sources.push(
        sourceFromCommand(
          `apt-cache:${packageName}`,
          result,
          parsed ? "ok" : status,
          parsed ? undefined : result.stderr.trim() || "Unable to inspect package policy.",
        ),
      );
      if (parsed) {
        policies.set(packageName, parsed);
      }
    }
  }

  const tools = specs.map((spec) => {
    const path = resolveExecutable(spec.command);
    const policy = spec.packageName ? policies.get(spec.packageName) : undefined;
    const installed = path !== undefined;

    return {
      name: spec.name,
      command: spec.command,
      packageName: spec.packageName,
      installed,
      path,
      packageAvailable: policy?.available,
      candidateVersion: policy?.candidateVersion,
      installHint: installed
        ? undefined
        : spec.packageName
          ? `Install package '${spec.packageName}' to enable ${spec.name}.`
          : undefined,
      status: installed ? "available" : "missing",
    } satisfies ToolAvailability;
  });

  sources.push({
    id: "tool-resolution",
    kind: "derived",
    status: "ok",
    message: `Resolved ${tools.length} command paths from PATH.`,
  });

  return { tools, sources };
}

export function parseAptPolicy(packageName: string, stdout: string): PackagePolicy {
  const candidate = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("Candidate:"))
    ?.replace("Candidate:", "")
    .trim();

  return {
    packageName,
    available: Boolean(candidate && candidate !== "(none)"),
    candidateVersion: candidate && candidate !== "(none)" ? candidate : undefined,
  };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

