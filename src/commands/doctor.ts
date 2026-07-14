import { createCommandRunner } from "../adapters/command.js";
import { collectToolAvailability, DEFAULT_TOOL_SPECS } from "../adapters/toolAvailability.js";
import { inspectRunner, type RunnerScope } from "../runner/systemd.js";
import { CliError, readValue } from "./options.js";

const CORE_COMMANDS = new Set(["lsblk", "findmnt", "df", "du", "fstrim", "systemctl", "journalctl", "swapon"]);

export async function runDoctor(args: string[]): Promise<number> {
  const options = parseDoctorOptions(args);

  const result = await collectToolAvailability(createCommandRunner(), DEFAULT_TOOL_SPECS);
  const missingCore = result.tools.filter((tool) => CORE_COMMANDS.has(tool.command) && !tool.installed);
  const runner = await inspectRunner({
    scope: options.runnerScope,
    rootDir: options.rootDir,
  });
  const payload = {
    status: missingCore.length === 0 && runner.status !== "degraded" ? "ok" : "degraded",
    missingCoreCommands: missingCore.map((tool) => tool.command),
    tools: result.tools,
    runner,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload.status === "ok" ? 0 : 1;
  }

  process.stdout.write(`Drive Health Doctor: ${payload.status}\n`);
  for (const tool of result.tools) {
    const required = CORE_COMMANDS.has(tool.command) ? "required" : "optional";
    const state = tool.installed ? "installed" : tool.installHint ?? "missing";
    process.stdout.write(`- ${tool.command} (${required}): ${state}\n`);
  }
  process.stdout.write("\nRunner:\n");
  process.stdout.write(`- status: ${runner.status}\n`);
  process.stdout.write(`- scope: ${runner.scope}\n`);
  process.stdout.write(`- unit directory: ${runner.unitDir}\n`);
  process.stdout.write(`- systemctl: ${runner.dependencies.systemctl ? "installed" : "missing"}\n`);
  if (runner.dependencies.driveHealthBinary) {
    process.stdout.write(
      `- drive-health binary: ${runner.dependencies.driveHealthBinary} (${runner.dependencies.driveHealthBinaryExecutable ? "executable" : "missing"})\n`,
    );
  }
  for (const unit of [runner.service, runner.timer]) {
    process.stdout.write(`- ${unit.name}: ${unit.status}\n`);
    for (const issue of unit.issues) {
      process.stdout.write(`  - ${issue}\n`);
    }
  }

  return payload.status === "ok" ? 0 : 1;
}

interface DoctorOptions {
  json: boolean;
  runnerScope: RunnerScope;
  rootDir: string;
}

function parseDoctorOptions(args: string[]): DoctorOptions {
  const options: DoctorOptions = {
    json: false,
    runnerScope: "user",
    rootDir: "/",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--runner-scope") {
      options.runnerScope = parseScope(readValue(args, index, "--runner-scope"));
      index += 1;
      continue;
    }

    if (arg === "--root") {
      options.rootDir = readValue(args, index, "--root");
      index += 1;
      continue;
    }

    throw new CliError(`Unknown doctor option '${arg}'.`);
  }

  return options;
}

function parseScope(value: string): RunnerScope {
  if (value === "user" || value === "system") {
    return value;
  }
  throw new CliError(`Unsupported runner scope '${value}'.`);
}
