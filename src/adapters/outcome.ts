import { commandLabel, type CommandResult } from "./command.js";
import type { AdapterStatus, SourceRecord } from "../report/model.js";

export interface ParseOutcome<T> {
  status: AdapterStatus;
  value?: T;
  message?: string;
}

export function unsupportedResult(result: CommandResult): boolean {
  return result.errorCode === "ENOENT" || result.exitCode === 127;
}

export function sourceFromCommand(
  id: string,
  result: CommandResult,
  status: AdapterStatus,
  message?: string,
): SourceRecord {
  return {
    id,
    kind: "command",
    status,
    command: commandLabel(result.command, result.args),
    exitCode: result.exitCode,
    message,
  };
}

export function parseJson<T>(stdout: string): ParseOutcome<T> {
  try {
    return { status: "ok", value: JSON.parse(stdout) as T };
  } catch (error) {
    return {
      status: "parse-error",
      message: error instanceof Error ? error.message : "Unable to parse JSON output.",
    };
  }
}

export function statusFromCommand(result: CommandResult): AdapterStatus {
  if (unsupportedResult(result)) {
    return "unsupported";
  }

  if (result.exitCode === 0) {
    return "ok";
  }

  return "error";
}

