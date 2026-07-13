import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
  timedOut?: boolean;
}

export interface CommandOptions {
  timeoutMs?: number;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>;
}

export function createCommandRunner(): CommandRunner {
  return {
    run(command, args, options) {
      return runCommand(command, args, options);
    },
  };
}

export function commandLabel(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

export function resolveExecutable(command: string, pathEnv = process.env.PATH ?? ""): string | undefined {
  if (command.includes("/") || isAbsolute(command)) {
    return canExecute(command) ? command : undefined;
  }

  for (const entry of pathEnv.split(delimiter)) {
    if (!entry) {
      continue;
    }

    const candidate = join(entry, command);
    if (canExecute(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function runCommand(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, options.timeoutMs)
      : undefined;

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({
        command,
        args,
        exitCode: null,
        stdout: "",
        stderr: error.message,
        errorCode: error.code,
      });
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({
        command,
        args,
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
      });
    });
  });
}

function canExecute(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

