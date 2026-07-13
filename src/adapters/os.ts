import { hostname } from "node:os";
import { readFile } from "node:fs/promises";
import { sourceFromCommand, statusFromCommand } from "./outcome.js";
import type { CommandRunner } from "./command.js";
import type { HostSummary, SourceRecord } from "../report/model.js";

export interface OsCollection {
  host: HostSummary;
  sources: SourceRecord[];
}

export async function collectOs(runner: CommandRunner): Promise<OsCollection> {
  const sources: SourceRecord[] = [];
  const host: HostSummary = {
    hostname: hostname(),
  };

  try {
    const osRelease = await readFile("/etc/os-release", "utf8");
    Object.assign(host, parseOsRelease(osRelease));
    sources.push({ id: "etc-os-release", kind: "file", path: "/etc/os-release", status: "ok" });
  } catch (error) {
    sources.push({
      id: "etc-os-release",
      kind: "file",
      path: "/etc/os-release",
      status: "error",
      message: error instanceof Error ? error.message : "Unable to read /etc/os-release.",
    });
  }

  const uname = await runner.run("uname", ["-s", "-r", "-m"], { timeoutMs: 3000 });
  const unameStatus = statusFromCommand(uname);
  if (unameStatus === "ok") {
    Object.assign(host, parseUname(uname.stdout));
  }
  sources.push(sourceFromCommand("uname", uname, unameStatus, unameStatus === "ok" ? undefined : uname.stderr.trim()));

  return { host, sources };
}

export function parseOsRelease(contents: string): Pick<HostSummary, "osName" | "osVersion" | "osId"> {
  const values = new Map<string, string>();

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }

    values.set(match[1], unquote(match[2]));
  }

  return {
    osName: values.get("PRETTY_NAME") ?? values.get("NAME"),
    osVersion: values.get("VERSION_ID") ?? values.get("VERSION"),
    osId: values.get("ID"),
  };
}

export function parseUname(stdout: string): Pick<HostSummary, "kernelName" | "kernelRelease" | "architecture"> {
  const [kernelName, kernelRelease, architecture] = stdout.trim().split(/\s+/);

  return {
    kernelName,
    kernelRelease,
    architecture,
  };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

