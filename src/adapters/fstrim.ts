import { type CommandRunner } from "./command.js";
import { parseHumanBytes } from "./bytes.js";
import { sourceFromCommand, statusFromCommand } from "./outcome.js";
import type { FstrimDryRunEntry, FstrimTimerState, SourceRecord } from "../report/model.js";

export interface FstrimCollection {
  timer: FstrimTimerState;
  dryRun: {
    status: "ok" | "unsupported" | "parse-error" | "error";
    entries: FstrimDryRunEntry[];
    message?: string;
  };
  sources: SourceRecord[];
}

export async function collectFstrim(runner: CommandRunner): Promise<FstrimCollection> {
  const sources: SourceRecord[] = [];
  const timerResult = await runner.run(
    "systemctl",
    [
      "show",
      "fstrim.timer",
      "--property=LoadState,UnitFileState,ActiveState,LastTriggerUSec,NextElapseUSecRealtime",
    ],
    { timeoutMs: 7000 },
  );
  const timerStatus = statusFromCommand(timerResult);
  const timer =
    timerStatus === "ok"
      ? parseFstrimTimer(timerResult.stdout)
      : {
          unit: "fstrim.timer" as const,
          status: timerStatus,
        };
  sources.push(sourceFromCommand("systemctl:fstrim.timer", timerResult, timer.status, timerResult.stderr.trim()));

  const dryRunResult = await runner.run(
    "fstrim",
    ["--listed-in", "/etc/fstab:/proc/self/mountinfo", "--verbose", "--dry-run"],
    { timeoutMs: 15000 },
  );
  const dryRunStatus = statusFromCommand(dryRunResult);
  const dryRun =
    dryRunStatus === "ok"
      ? parseFstrimDryRun(dryRunResult.stdout)
      : {
          status: dryRunStatus,
          entries: [],
          message: dryRunResult.stderr.trim() || "Unable to run fstrim dry-run.",
        };
  sources.push(sourceFromCommand("fstrim:dry-run", dryRunResult, dryRun.status, dryRun.message));

  return { timer, dryRun, sources };
}

export function parseFstrimTimer(stdout: string): FstrimTimerState {
  const values = parseSystemctlShow(stdout);

  return {
    unit: "fstrim.timer",
    loadState: values.get("LoadState"),
    unitFileState: values.get("UnitFileState"),
    activeState: values.get("ActiveState"),
    lastTrigger: normalizeTimestamp(values.get("LastTriggerUSec")),
    nextTrigger: normalizeTimestamp(values.get("NextElapseUSecRealtime")),
    status: "ok",
  };
}

export function parseFstrimDryRun(stdout: string): {
  status: "ok" | "parse-error";
  entries: FstrimDryRunEntry[];
  message?: string;
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {
      status: "ok",
      entries: [],
      message: "Dry-run completed but produced no filesystem output.",
    };
  }

  const entries: FstrimDryRunEntry[] = [];
  const failures: string[] = [];

  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^(.+?):\s+(.+?)(?:\s+would be)?\s+trimmed(?:\s+on\s+(.+))?$/i);
    if (!match) {
      failures.push(line);
      continue;
    }

    entries.push({
      target: match[1],
      bytes: parseHumanBytes(match[2]),
      device: match[3],
      rawSummary: match[2],
    });
  }

  if (failures.length > 0 && entries.length === 0) {
    return {
      status: "parse-error",
      entries: [],
      message: `Unable to parse fstrim dry-run output: ${failures[0]}`,
    };
  }

  return { status: "ok", entries };
}

function parseSystemctlShow(stdout: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of stdout.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index === -1) {
      continue;
    }

    values.set(line.slice(0, index), line.slice(index + 1));
  }

  return values;
}

function normalizeTimestamp(value: string | undefined): string | undefined {
  if (!value || value === "n/a") {
    return undefined;
  }

  return value;
}

