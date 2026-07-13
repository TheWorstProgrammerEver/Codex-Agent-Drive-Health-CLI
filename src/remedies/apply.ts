import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CommandRunner } from "../adapters/command.js";
import { commandLabel, createCommandRunner } from "../adapters/command.js";
import type { DriveHealthReport } from "../report/model.js";
import { getRemedy } from "./catalogue.js";
import type { ApplyResult, PlannedChange, RemedyMetadata } from "./model.js";
import { selectRemedySuggestions } from "./selection.js";

const JOURNALD_DROP_IN = "/etc/systemd/journald.conf.d/90-drive-health-limits.conf";
const JOURNALD_DROP_IN_CONTENT = `# Managed by drive-health remedy limit-journald-disk-usage.
[Journal]
SystemMaxUse=256M
SystemKeepFree=1G
RuntimeMaxUse=128M
`;

export interface ApplyOptions {
  remedyId: string;
  report: DriveHealthReport;
  dryRun: boolean;
  confirmed: boolean;
  stateDir?: string;
  rootDir?: string;
  runner?: CommandRunner;
  now?: Date;
  isRoot?: boolean;
}

export async function applyRemedy(options: ApplyOptions): Promise<ApplyResult> {
  const remedy = getRemedy(options.remedyId);
  if (!remedy) {
    throw new Error(`Unknown remedy '${options.remedyId}'.`);
  }

  const stateDir = options.stateDir ?? "/var/lib/drive-health";
  const rootDir = options.rootDir ?? "/";
  const runner = options.runner ?? createCommandRunner();
  const suggestion = selectRemedySuggestions(options.report).find((candidate) => candidate.remedy.id === remedy.id);
  const base = baseResult(remedy, options.dryRun, suggestion?.reason ?? remedy.summary);

  if (!remedy.executable || remedy.mode !== "executable") {
    return {
      ...base,
      status: suggestion?.status === "unsupported" ? "unsupported" : "advisory",
      reason: `${base.reason} This remedy is advisory; no automated changes are available in the vetted catalogue.`,
      plannedChanges: advisoryPlan(remedy),
      backups: backupNotes(remedy),
      verification: declarationVerification(remedy),
      rollback: declarationRollback(remedy),
    };
  }

  if (suggestion?.status === "unsupported" || suggestion?.status === "advisory") {
    return {
      ...base,
      status: suggestion.status,
      plannedChanges: advisoryPlan(remedy),
      backups: backupNotes(remedy),
    };
  }

  const plan = await executablePlan(remedy, stateDir, rootDir, options.now ?? new Date());

  if (isAlreadyApplied(remedy, suggestion?.status, plan.alreadyApplied)) {
    return {
      ...base,
      status: "already-applied",
      plannedChanges: plan.changes,
      backups: [],
      verification: remedy.executable.verification,
      rollback: remedy.executable.rollback,
    };
  }

  if (options.dryRun) {
    return {
      ...base,
      status: "dry-run",
      plannedChanges: plan.changes,
      backups: [plan.backupPath],
      verification: remedy.executable.verification,
      rollback: remedy.executable.rollback,
    };
  }

  if (!options.confirmed) {
    return {
      ...base,
      status: "confirmation-required",
      reason: `${base.reason} Re-run with --yes after reviewing the dry-run plan.`,
      plannedChanges: plan.changes,
      backups: [plan.backupPath],
      verification: remedy.executable.verification,
      rollback: remedy.executable.rollback,
    };
  }

  if (requiresRealRoot(rootDir, options.isRoot)) {
    return {
      ...base,
      status: "advisory",
      reason: `${base.reason} Non-dry-run execution needs root privileges; no changes were made.`,
      plannedChanges: plan.changes,
      backups: [plan.backupPath],
      verification: remedy.executable.verification,
      rollback: remedy.executable.rollback,
    };
  }

  switch (remedy.id) {
    case "enable-weekly-fstrim":
      return executeFstrim(remedy, base, stateDir, runner, options.report, options.now ?? new Date());
    case "limit-journald-disk-usage":
      return executeJournald(remedy, base, stateDir, rootDir, runner, options.now ?? new Date());
    default:
      return {
        ...base,
        status: "advisory",
        plannedChanges: advisoryPlan(remedy),
      };
  }
}

interface ExecutionPlan {
  changes: PlannedChange[];
  backupPath: string;
  alreadyApplied: boolean;
}

function baseResult(remedy: RemedyMetadata, dryRun: boolean, reason: string): ApplyResult {
  return {
    remedy,
    status: dryRun ? "dry-run" : "applied",
    dryRun,
    reason,
    prechecks: remedy.executable?.prechecks ?? [],
    plannedChanges: [],
    backups: [],
    filesChanged: [],
    commandsRun: [],
    verification: declarationVerification(remedy),
    rollback: declarationRollback(remedy),
  };
}

async function executablePlan(remedy: RemedyMetadata, stateDir: string, rootDir: string, now: Date): Promise<ExecutionPlan> {
  const backupPath = backupPathFor(stateDir, remedy.id, now, remedy.id === "enable-weekly-fstrim" ? "fstrim.timer.before.json" : "90-drive-health-limits.conf.before");

  if (remedy.id === "limit-journald-disk-usage") {
    const current = await readTextIfExists(rootPath(rootDir, JOURNALD_DROP_IN));
    const alreadyApplied = current === JOURNALD_DROP_IN_CONTENT;
    return {
      backupPath,
      alreadyApplied,
      changes: [
        {
          kind: "backup",
          description: `Back up current ${JOURNALD_DROP_IN} state to ${backupPath}.`,
          path: backupPath,
        },
        {
          kind: "file",
          description: alreadyApplied
            ? `${JOURNALD_DROP_IN} already matches the drive-health policy.`
            : `Write bounded journald policy to ${JOURNALD_DROP_IN}.`,
          path: JOURNALD_DROP_IN,
        },
        ...commandChanges(remedy),
      ],
    };
  }

  return {
    backupPath,
    alreadyApplied: false,
    changes: [
      {
        kind: "backup",
        description: `Record current fstrim.timer state at ${backupPath}.`,
        path: backupPath,
      },
      ...commandChanges(remedy),
    ],
  };
}

async function executeFstrim(
  remedy: RemedyMetadata,
  base: ApplyResult,
  stateDir: string,
  runner: CommandRunner,
  report: DriveHealthReport,
  now: Date,
): Promise<ApplyResult> {
  const backupPath = backupPathFor(stateDir, remedy.id, now, "fstrim.timer.before.json");
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, `${JSON.stringify(report.trim.timer, null, 2)}\n`, "utf8");

  const commands = [
    ["systemctl", ["enable", "--now", "fstrim.timer"]],
    ["systemctl", ["is-enabled", "fstrim.timer"]],
    ["systemctl", ["is-active", "fstrim.timer"]],
    ["fstrim", ["--listed-in", "/etc/fstab:/proc/self/mountinfo", "--verbose", "--dry-run"]],
  ] as const;
  const run = await runCommands(runner, commands);

  return {
    ...base,
    status: run.error ? "failed" : "applied",
    plannedChanges: [
      { kind: "backup", description: `Recorded current fstrim.timer state at ${backupPath}.`, path: backupPath },
      ...commandChanges(remedy),
    ],
    backups: [backupPath],
    commandsRun: run.commandsRun,
    verification: remedy.executable?.verification ?? [],
    rollback: remedy.executable?.rollback ?? [],
    error: run.error,
  };
}

async function executeJournald(
  remedy: RemedyMetadata,
  base: ApplyResult,
  stateDir: string,
  rootDir: string,
  runner: CommandRunner,
  now: Date,
): Promise<ApplyResult> {
  const targetPath = rootPath(rootDir, JOURNALD_DROP_IN);
  const backupPath = backupPathFor(stateDir, remedy.id, now, "90-drive-health-limits.conf.before");
  const backupRecord = await backupFileOrAbsence(targetPath, backupPath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JOURNALD_DROP_IN_CONTENT, "utf8");

  const validation = await runCommands(runner, [["systemd-analyze", ["cat-config", "systemd/journald.conf"]]]);
  if (validation.error) {
    await restoreBackup(targetPath, backupPath);
    return {
      ...base,
      status: "failed",
      plannedChanges: [
        { kind: "backup", description: `Backed up current ${JOURNALD_DROP_IN} state to ${backupPath}.`, path: backupPath },
        { kind: "file", description: `Attempted to write ${JOURNALD_DROP_IN}; restored backup after validation failed.`, path: JOURNALD_DROP_IN },
        ...commandChanges(remedy),
      ],
      backups: [backupRecord],
      commandsRun: validation.commandsRun,
      verification: remedy.executable?.verification ?? [],
      rollback: remedy.executable?.rollback ?? [],
      error: validation.error,
    };
  }

  const reload = await runCommands(runner, [
    ["systemctl", ["restart", "systemd-journald.service"]],
    ["journalctl", ["--disk-usage"]],
  ]);

  return {
    ...base,
    status: reload.error ? "failed" : "applied",
    plannedChanges: [
      { kind: "backup", description: `Backed up current ${JOURNALD_DROP_IN} state to ${backupPath}.`, path: backupPath },
      { kind: "file", description: `Wrote bounded journald policy to ${JOURNALD_DROP_IN}.`, path: JOURNALD_DROP_IN },
      ...commandChanges(remedy),
    ],
    backups: [backupRecord],
    filesChanged: [JOURNALD_DROP_IN],
    commandsRun: [...validation.commandsRun, ...reload.commandsRun],
    verification: remedy.executable?.verification ?? [],
    rollback: remedy.executable?.rollback ?? [],
    error: reload.error,
  };
}

async function runCommands(
  runner: CommandRunner,
  commands: readonly (readonly [string, readonly string[]])[],
): Promise<{ commandsRun: string[]; error?: string }> {
  const commandsRun: string[] = [];
  for (const [command, args] of commands) {
    const result = await runner.run(command, [...args], { timeoutMs: 15000 });
    commandsRun.push(commandLabel(command, [...args]));
    if (result.exitCode !== 0) {
      return {
        commandsRun,
        error: result.stderr.trim() || `${commandLabel(command, [...args])} exited with ${result.exitCode ?? "no status"}.`,
      };
    }
  }

  return { commandsRun };
}

function commandChanges(remedy: RemedyMetadata): PlannedChange[] {
  return (remedy.executable?.commands ?? []).map((command) => ({
    kind: command.reason.includes("Verify") || command.reason.includes("Re-run") ? "verification" : "command",
    description: command.reason,
    command: commandLabel(command.command, command.args),
  }));
}

function advisoryPlan(remedy: RemedyMetadata): PlannedChange[] {
  const commands = remedy.executable?.commands ?? remedy.advisory?.commands ?? [];
  const filesTouched = remedy.executable?.filesTouched ?? remedy.advisory?.filesTouched ?? [];
  const fileChanges: PlannedChange[] = filesTouched.map((path) => ({
    kind: "advisory",
    description: `Review possible file or state touch: ${path}.`,
    path,
  }));

  if (commands.length > 0) {
    return [...fileChanges, ...commandListChanges(commands)];
  }

  return [
    {
      kind: "advisory",
      description: "Review the remedy Markdown and structured report evidence; this catalogue entry intentionally has no automated apply step.",
    },
  ];
}

function commandListChanges(commands: readonly { command: string; args: string[]; reason: string }[]): PlannedChange[] {
  return commands.map((command) => ({
    kind: command.reason.includes("Verify") || command.reason.includes("Measure") ? "verification" : "command",
    description: command.reason,
    command: commandLabel(command.command, command.args),
  }));
}

function declarationVerification(remedy: RemedyMetadata): string[] {
  return remedy.executable?.verification ?? remedy.advisory?.verification ?? [];
}

function declarationRollback(remedy: RemedyMetadata): string[] {
  return remedy.executable?.rollback ?? remedy.advisory?.rollback ?? [];
}

function backupNotes(remedy: RemedyMetadata): string[] {
  const backup = remedy.executable?.backupPath ?? remedy.advisory?.backupPath;
  return backup ? [backup] : [];
}

function isAlreadyApplied(remedy: RemedyMetadata, suggestionStatus: string | undefined, planAlreadyApplied: boolean): boolean {
  return suggestionStatus === "already-applied" || (remedy.id === "limit-journald-disk-usage" && planAlreadyApplied);
}

function backupPathFor(stateDir: string, remedyId: string, now: Date, filename: string): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return join(stateDir, "backups", `${stamp}-${remedyId}`, filename);
}

async function backupFileOrAbsence(sourcePath: string, backupPath: string): Promise<string> {
  await mkdir(dirname(backupPath), { recursive: true });
  const current = await readTextIfExists(sourcePath);
  if (current === undefined) {
    const absencePath = `${backupPath}.absent`;
    await writeFile(absencePath, "The target file did not exist before apply.\n", "utf8");
    return absencePath;
  }

  await copyFile(sourcePath, backupPath);
  return backupPath;
}

async function restoreBackup(targetPath: string, backupPath: string): Promise<void> {
  const backup = await readTextIfExists(backupPath);
  if (backup === undefined) {
    await rm(targetPath, { force: true });
    return;
  }

  await writeFile(targetPath, backup, "utf8");
}

async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

function rootPath(rootDir: string, absolutePath: string): string {
  if (rootDir === "/") {
    return absolutePath;
  }

  return join(rootDir, absolutePath.replace(/^\//, ""));
}

function requiresRealRoot(rootDir: string, isRoot: boolean | undefined): boolean {
  if (rootDir !== "/") {
    return false;
  }

  if (isRoot !== undefined) {
    return !isRoot;
  }

  return typeof process.getuid === "function" && process.getuid() !== 0;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
