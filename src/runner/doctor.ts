import { accessSync, constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveExecutable } from "../adapters/command.js";
import { HOST_PROFILES, isHostProfile } from "../report/model.js";
import {
  DEFAULT_ON_CALENDAR,
  DEFAULT_RANDOMIZED_DELAY,
  EXAMPLE_BIN_PLACEHOLDER,
  EXAMPLE_STATE_DIR_PLACEHOLDER,
  MANAGED_MARKER,
  RUNNER_SERVICE_NAME,
  RUNNER_TIMER_NAME,
  renderRunnerServiceUnit,
  renderRunnerTimerUnit,
  unitDirectory,
  type RunnerScope,
  type RunnerUnitOptions,
  type UnitStatus,
} from "./units.js";

export interface RunnerDoctorOptions {
  scope: RunnerScope;
  rootDir: string;
  pathEnv?: string;
}

export interface UnitInspection {
  name: string;
  path: string;
  status: UnitStatus;
  issues: string[];
}

export interface RunnerDoctorReport {
  status: "ok" | "not-installed" | "degraded";
  scope: RunnerScope;
  unitDir: string;
  dependencies: {
    systemctl: boolean;
    driveHealthBinary?: string;
    driveHealthBinaryExecutable?: boolean;
  };
  service: UnitInspection;
  timer: UnitInspection;
}

export async function inspectRunner(options: RunnerDoctorOptions): Promise<RunnerDoctorReport> {
  const unitDir = unitDirectory(options.rootDir, options.scope);
  const service = await inspectService(join(unitDir, RUNNER_SERVICE_NAME), options.rootDir);
  const timer = await inspectTimer(join(unitDir, RUNNER_TIMER_NAME));
  const installed = service.status !== "missing" || timer.status !== "missing";
  const degraded = installed && (service.status !== "ok" || timer.status !== "ok");
  const dependencies = {
    systemctl: resolveExecutable("systemctl", options.pathEnv) !== undefined,
    driveHealthBinary: execStartParts(await readTextIfExists(service.path))?.binPath,
    driveHealthBinaryExecutable: undefined as boolean | undefined,
  };

  if (dependencies.driveHealthBinary) {
    dependencies.driveHealthBinaryExecutable = isExecutable(rootPath(options.rootDir, dependencies.driveHealthBinary));
  }

  return {
    status: installed
      ? degraded || !dependencies.systemctl || dependencies.driveHealthBinaryExecutable === false ? "degraded" : "ok"
      : "not-installed",
    scope: options.scope,
    unitDir,
    dependencies,
    service,
    timer,
  };
}

async function inspectService(path: string, rootDir: string): Promise<UnitInspection> {
  const content = await readTextIfExists(path);
  if (content === undefined) {
    return missingUnit(RUNNER_SERVICE_NAME, path);
  }

  const issues = serviceIssues(content, rootDir);
  const parts = execStartParts(content);
  const expected = parts && isHostProfile(parts.profile) ? renderRunnerServiceUnit({ ...parts, profile: parts.profile }) : undefined;
  const stale = expected !== undefined && content !== expected;

  return {
    name: RUNNER_SERVICE_NAME,
    path,
    status: issues.length > 0 ? "invalid" : stale ? "stale" : "ok",
    issues: issues.length > 0 ? issues : stale ? ["service file differs from the current drive-health runner template"] : [],
  };
}

async function inspectTimer(path: string): Promise<UnitInspection> {
  const content = await readTextIfExists(path);
  if (content === undefined) {
    return missingUnit(RUNNER_TIMER_NAME, path);
  }

  const issues = timerIssues(content);
  const options = timerParts(content);
  const expected = options
    ? renderRunnerTimerUnit({
        binPath: EXAMPLE_BIN_PLACEHOLDER,
        stateDir: EXAMPLE_STATE_DIR_PLACEHOLDER,
        profile: "pi-usb-flash",
        retentionCount: 30,
        onCalendar: options.onCalendar,
        randomizedDelaySec: options.randomizedDelaySec,
      })
    : undefined;
  const stale = expected !== undefined && normalizeTimer(content) !== normalizeTimer(expected);

  return {
    name: RUNNER_TIMER_NAME,
    path,
    status: issues.length > 0 ? "invalid" : stale ? "stale" : "ok",
    issues: issues.length > 0 ? issues : stale ? ["timer file differs from the current drive-health runner template"] : [],
  };
}

function serviceIssues(content: string, rootDir: string): string[] {
  const issues: string[] = [];
  const parts = execStartParts(content);

  if (!content.includes(MANAGED_MARKER)) {
    issues.push("missing drive-health managed marker");
  }
  if (!parts) {
    issues.push("missing or unsupported ExecStart");
    return issues;
  }
  if (parts.binPath.includes("__") || parts.stateDir.includes("__")) {
    issues.push("unit still contains unexpanded placeholders");
  }
  if (parts.command !== "check") {
    issues.push("runner service must invoke drive-health check");
  }
  if (!isHostProfile(parts.profile)) {
    issues.push(`runner service must use a supported --profile (${HOST_PROFILES.join(", ")})`);
  }
  if (parts.args.includes("apply") || parts.args.includes("--include-identifiers")) {
    issues.push("runner service must not apply remedies or include host identifiers");
  }
  if (!parts.args.includes("--write-report")) {
    issues.push("runner service must write a bounded report");
  }
  if (!parts.args.includes("--quiet")) {
    issues.push("runner service should suppress routine stdout to reduce journal writes");
  }
  if (!parts.stateDir) {
    issues.push("runner service must pass --state-dir");
  }
  if (!Number.isInteger(parts.retentionCount) || parts.retentionCount < 1) {
    issues.push("runner service must pass a positive --retention-count");
  }
  if (!content.includes("UMask=077")) {
    issues.push("runner service must set UMask=077 for private report files");
  }
  if (parts.binPath.startsWith("/") && !isExecutable(rootPath(rootDir, parts.binPath))) {
    issues.push(`drive-health binary is not executable at ${parts.binPath}`);
  }

  return issues;
}

function timerIssues(content: string): string[] {
  const issues: string[] = [];
  if (!content.includes(MANAGED_MARKER)) {
    issues.push("missing drive-health managed marker");
  }
  if (!/^OnCalendar=.+$/m.test(content)) {
    issues.push("timer must set OnCalendar");
  }
  if (!/^RandomizedDelaySec=.+$/m.test(content)) {
    issues.push("timer must set RandomizedDelaySec");
  }
  if (!/^Persistent=true$/m.test(content)) {
    issues.push("timer must set Persistent=true");
  }
  if (!new RegExp(`^Unit=${RUNNER_SERVICE_NAME}$`, "m").test(content)) {
    issues.push(`timer must target ${RUNNER_SERVICE_NAME}`);
  }
  return issues;
}

interface ParsedServiceParts extends Omit<RunnerUnitOptions, "profile"> {
  command: string;
  args: string[];
  profile: string;
}

function execStartParts(content: string | undefined): ParsedServiceParts | undefined {
  const line = content?.split(/\r?\n/).find((entry) => entry.startsWith("ExecStart="));
  if (!line) {
    return undefined;
  }

  const tokens = line.replace("ExecStart=", "").trim().split(/\s+/);
  const [binPath, command, ...args] = tokens;
  const profile = valueAfter(args, "--profile");
  const stateDir = valueAfter(args, "--state-dir");
  const retentionCount = Number(valueAfter(args, "--retention-count"));

  if (!binPath || !command || !profile || !stateDir) {
    return undefined;
  }

  return {
    binPath,
    command,
    args,
    profile,
    stateDir,
    retentionCount,
    onCalendar: DEFAULT_ON_CALENDAR,
    randomizedDelaySec: DEFAULT_RANDOMIZED_DELAY,
  };
}

function timerParts(content: string): Pick<RunnerUnitOptions, "onCalendar" | "randomizedDelaySec"> | undefined {
  const onCalendar = valueForKey(content, "OnCalendar");
  const randomizedDelaySec = valueForKey(content, "RandomizedDelaySec");
  return onCalendar && randomizedDelaySec ? { onCalendar, randomizedDelaySec } : undefined;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function valueForKey(content: string, key: string): string | undefined {
  return content
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1);
}

function normalizeTimer(content: string): string {
  return content.replace(new RegExp(`${EXAMPLE_BIN_PLACEHOLDER}|${EXAMPLE_STATE_DIR_PLACEHOLDER}`, "g"), "");
}

function missingUnit(name: string, path: string): UnitInspection {
  return {
    name,
    path,
    status: "missing",
    issues: ["unit file is not installed"],
  };
}

async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function rootPath(rootDir: string, absolutePath: string): string {
  if (!absolutePath.startsWith("/") || rootDir === "/") {
    return absolutePath;
  }
  return join(rootDir, absolutePath.replace(/^\//, ""));
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
