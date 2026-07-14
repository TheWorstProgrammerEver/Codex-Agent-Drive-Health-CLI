import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  RUNNER_SERVICE_NAME,
  RUNNER_TIMER_NAME,
  renderRunnerServiceUnit,
  renderRunnerTimerUnit,
  unitDirectory,
  type RunnerScope,
  type RunnerUnitOptions,
} from "./units.js";

export interface RunnerInstallOptions extends RunnerUnitOptions {
  scope: RunnerScope;
  rootDir: string;
  dryRun: boolean;
}

export interface RunnerInstallResult {
  dryRun: boolean;
  scope: RunnerScope;
  unitDir: string;
  servicePath: string;
  timerPath: string;
  filesWritten: string[];
  nextCommands: string[];
}

export interface RunnerUninstallOptions {
  scope: RunnerScope;
  rootDir: string;
  dryRun: boolean;
}

export interface RunnerUninstallResult {
  dryRun: boolean;
  scope: RunnerScope;
  unitDir: string;
  filesRemoved: string[];
  nextCommands: string[];
}

export async function installRunner(options: RunnerInstallOptions): Promise<RunnerInstallResult> {
  const unitDir = unitDirectory(options.rootDir, options.scope);
  const servicePath = join(unitDir, RUNNER_SERVICE_NAME);
  const timerPath = join(unitDir, RUNNER_TIMER_NAME);
  const filesWritten: string[] = [];

  if (!options.dryRun) {
    await mkdir(unitDir, { recursive: true });
    await writeFile(servicePath, renderRunnerServiceUnit(options), "utf8");
    await writeFile(timerPath, renderRunnerTimerUnit(options), "utf8");
    filesWritten.push(servicePath, timerPath);
  }

  return {
    dryRun: options.dryRun,
    scope: options.scope,
    unitDir,
    servicePath,
    timerPath,
    filesWritten,
    nextCommands: nextEnableCommands(options.scope),
  };
}

export async function uninstallRunner(options: RunnerUninstallOptions): Promise<RunnerUninstallResult> {
  const unitDir = unitDirectory(options.rootDir, options.scope);
  const files = [join(unitDir, RUNNER_SERVICE_NAME), join(unitDir, RUNNER_TIMER_NAME)];
  const filesRemoved: string[] = [];

  if (!options.dryRun) {
    for (const path of files) {
      if (existsSync(path)) {
        await rm(path, { force: true });
        filesRemoved.push(path);
      }
    }
  }

  return {
    dryRun: options.dryRun,
    scope: options.scope,
    unitDir,
    filesRemoved,
    nextCommands: nextDisableCommands(options.scope),
  };
}

function nextEnableCommands(scope: RunnerScope): string[] {
  const systemctl = scope === "user" ? "systemctl --user" : "systemctl";
  return [
    `${systemctl} daemon-reload`,
    `${systemctl} enable --now ${RUNNER_TIMER_NAME}`,
  ];
}

function nextDisableCommands(scope: RunnerScope): string[] {
  const systemctl = scope === "user" ? "systemctl --user" : "systemctl";
  return [
    `${systemctl} disable --now ${RUNNER_TIMER_NAME}`,
    `${systemctl} daemon-reload`,
  ];
}
