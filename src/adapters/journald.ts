import { stat, readFile } from "node:fs/promises";
import { parseHumanBytes } from "./bytes.js";
import { sourceFromCommand, statusFromCommand } from "./outcome.js";
import type { CommandRunner } from "./command.js";
import type { JournaldReport, SourceRecord } from "../report/model.js";

export interface JournaldCollection {
  journald: JournaldReport;
  sources: SourceRecord[];
}

export async function collectJournald(runner: CommandRunner): Promise<JournaldCollection> {
  const sources: SourceRecord[] = [];
  const storageMode = await readStorageMode(sources);
  const persistentDirectoryPresent = await hasPersistentJournalDirectory(sources);
  const diskUsage = await runner.run("journalctl", ["--disk-usage"], { timeoutMs: 7000 });
  const status = statusFromCommand(diskUsage);

  if (status !== "ok") {
    sources.push(sourceFromCommand("journalctl:disk-usage", diskUsage, status, diskUsage.stderr.trim()));
    return {
      journald: {
        storageMode,
        persistentDirectoryPresent,
        status,
        message: diskUsage.stderr.trim() || "Unable to read journald disk usage.",
      },
      sources,
    };
  }

  const parsed = parseJournalDiskUsage(diskUsage.stdout);
  sources.push(
    sourceFromCommand(
      "journalctl:disk-usage",
      diskUsage,
      parsed === undefined ? "parse-error" : "ok",
      parsed === undefined ? "Unable to parse journald disk usage." : undefined,
    ),
  );

  return {
    journald: {
      storageMode,
      persistentDirectoryPresent,
      diskUsageBytes: parsed,
      status: parsed === undefined ? "parse-error" : "ok",
    },
    sources,
  };
}

export function parseJournalDiskUsage(stdout: string): number | undefined {
  const match = stdout.match(/take up\s+(.+?)\s+in the file system/i);
  return match ? parseHumanBytes(match[1]) : undefined;
}

export function parseJournaldStorageMode(contents: string): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^Storage\s*=\s*(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

async function readStorageMode(sources: SourceRecord[]): Promise<string> {
  try {
    const contents = await readFile("/etc/systemd/journald.conf", "utf8");
    sources.push({ id: "journald:config", kind: "file", path: "/etc/systemd/journald.conf", status: "ok" });
    return parseJournaldStorageMode(contents) ?? "auto";
  } catch (error) {
    sources.push({
      id: "journald:config",
      kind: "file",
      path: "/etc/systemd/journald.conf",
      status: "error",
      message: error instanceof Error ? error.message : "Unable to read journald.conf.",
    });
    return "unknown";
  }
}

async function hasPersistentJournalDirectory(sources: SourceRecord[]): Promise<boolean> {
  try {
    const journalDirectory = await stat("/var/log/journal");
    sources.push({ id: "journald:persistent-directory", kind: "file", path: "/var/log/journal", status: "ok" });
    return journalDirectory.isDirectory();
  } catch {
    sources.push({
      id: "journald:persistent-directory",
      kind: "file",
      path: "/var/log/journal",
      status: "ok",
      message: "Persistent journal directory is absent.",
    });
    return false;
  }
}

