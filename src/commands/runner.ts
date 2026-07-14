import { isAbsolute } from "node:path";
import { resolveExecutable } from "../adapters/command.js";
import type { HostProfile } from "../report/model.js";
import {
  DEFAULT_ON_CALENDAR,
  DEFAULT_RANDOMIZED_DELAY,
  defaultStateDir,
  installRunner,
  renderExampleServiceUnit,
  renderExampleTimerUnit,
  type RunnerScope,
  uninstallRunner,
} from "../runner/systemd.js";
import { DEFAULT_REPORT_RETENTION_COUNT } from "../state/reports.js";
import { CliError, isHostProfile, parsePositiveInteger, readValue } from "./options.js";

export async function runRunner(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "template":
      return runTemplate();
    case "install":
      return runInstall(rest);
    case "uninstall":
      return runUninstall(rest);
    default:
      throw new CliError("Expected runner subcommand: template, install, or uninstall.");
  }
}

function runTemplate(): number {
  process.stdout.write(`# ${RUNNER_SERVICE_HEADING}\n`);
  process.stdout.write(renderExampleServiceUnit());
  process.stdout.write(`\n# ${RUNNER_TIMER_HEADING}\n`);
  process.stdout.write(renderExampleTimerUnit());
  return 0;
}

const RUNNER_SERVICE_HEADING = "drive-health-check.service";
const RUNNER_TIMER_HEADING = "drive-health-check.timer";

async function runInstall(args: string[]): Promise<number> {
  const options = parseRunnerInstallOptions(args);
  const result = await installRunner(options);

  process.stdout.write(`Drive Health runner install${result.dryRun ? " dry-run" : ""}\n`);
  process.stdout.write(`Scope: ${result.scope}\n`);
  process.stdout.write(`Unit directory: ${result.unitDir}\n`);
  process.stdout.write(`Service: ${result.servicePath}\n`);
  process.stdout.write(`Timer: ${result.timerPath}\n`);
  process.stdout.write("Files written:\n");
  for (const file of result.filesWritten) {
    process.stdout.write(`- ${file}\n`);
  }
  if (result.filesWritten.length === 0) {
    process.stdout.write("- none\n");
  }
  process.stdout.write("Not enabled automatically. To enable after review:\n");
  for (const command of result.nextCommands) {
    process.stdout.write(`- ${command}\n`);
  }

  return 0;
}

async function runUninstall(args: string[]): Promise<number> {
  const options = parseRunnerUninstallOptions(args);
  const result = await uninstallRunner(options);

  process.stdout.write(`Drive Health runner uninstall${result.dryRun ? " dry-run" : ""}\n`);
  process.stdout.write(`Scope: ${result.scope}\n`);
  process.stdout.write(`Unit directory: ${result.unitDir}\n`);
  process.stdout.write("Disable first if the timer is enabled:\n");
  for (const command of result.nextCommands) {
    process.stdout.write(`- ${command}\n`);
  }
  process.stdout.write("Files removed:\n");
  for (const file of result.filesRemoved) {
    process.stdout.write(`- ${file}\n`);
  }
  if (result.filesRemoved.length === 0) {
    process.stdout.write("- none\n");
  }

  return 0;
}

function parseRunnerInstallOptions(args: string[]) {
  let scope: RunnerScope = "user";
  let binPath: string | undefined;
  let stateDir: string | undefined;
  let profile: HostProfile = "auto";
  let retentionCount = DEFAULT_REPORT_RETENTION_COUNT;
  let onCalendar = DEFAULT_ON_CALENDAR;
  let randomizedDelaySec = DEFAULT_RANDOMIZED_DELAY;
  let rootDir = "/";
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--scope") {
      scope = parseScope(readValue(args, index, "--scope"));
      index += 1;
      continue;
    }

    if (arg === "--bin") {
      binPath = readValue(args, index, "--bin");
      index += 1;
      continue;
    }

    if (arg === "--state-dir") {
      stateDir = readValue(args, index, "--state-dir");
      index += 1;
      continue;
    }

    if (arg === "--profile") {
      const value = readValue(args, index, "--profile");
      if (!isHostProfile(value)) {
        throw new CliError(`Unsupported profile '${value}'.`);
      }
      profile = value;
      index += 1;
      continue;
    }

    if (arg === "--retention-count") {
      retentionCount = parsePositiveInteger(readValue(args, index, "--retention-count"), "--retention-count");
      index += 1;
      continue;
    }

    if (arg === "--on-calendar") {
      onCalendar = readValue(args, index, "--on-calendar");
      index += 1;
      continue;
    }

    if (arg === "--randomized-delay-sec") {
      randomizedDelaySec = readValue(args, index, "--randomized-delay-sec");
      index += 1;
      continue;
    }

    if (arg === "--root") {
      rootDir = readValue(args, index, "--root");
      index += 1;
      continue;
    }

    throw new CliError(`Unknown runner install option '${arg}'.`);
  }

  const resolvedBin = binPath ?? resolveExecutable("drive-health");
  if (!resolvedBin) {
    throw new CliError("Could not resolve drive-health from PATH. Pass --bin with an absolute executable path.");
  }
  if (!isAbsolute(resolvedBin)) {
    throw new CliError("--bin must be an absolute path for systemd ExecStart.");
  }

  return {
    scope,
    rootDir,
    dryRun,
    binPath: resolvedBin,
    stateDir: stateDir ?? defaultStateDir(scope),
    profile,
    retentionCount,
    onCalendar,
    randomizedDelaySec,
  };
}

function parseRunnerUninstallOptions(args: string[]) {
  let scope: RunnerScope = "user";
  let rootDir = "/";
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--scope") {
      scope = parseScope(readValue(args, index, "--scope"));
      index += 1;
      continue;
    }

    if (arg === "--root") {
      rootDir = readValue(args, index, "--root");
      index += 1;
      continue;
    }

    throw new CliError(`Unknown runner uninstall option '${arg}'.`);
  }

  return { scope, rootDir, dryRun };
}

function parseScope(value: string): RunnerScope {
  if (value === "user" || value === "system") {
    return value;
  }
  throw new CliError(`Unsupported runner scope '${value}'.`);
}
