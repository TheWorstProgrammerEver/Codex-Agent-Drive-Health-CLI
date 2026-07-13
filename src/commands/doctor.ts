import { createCommandRunner } from "../adapters/command.js";
import { collectToolAvailability, DEFAULT_TOOL_SPECS } from "../adapters/toolAvailability.js";
import { CliError } from "./options.js";

const CORE_COMMANDS = new Set(["lsblk", "findmnt", "df", "du", "fstrim", "systemctl", "journalctl", "swapon"]);

export async function runDoctor(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const unknown = args.find((arg) => arg !== "--json");
  if (unknown) {
    throw new CliError(`Unknown doctor option '${unknown}'.`);
  }

  const result = await collectToolAvailability(createCommandRunner(), DEFAULT_TOOL_SPECS);
  const missingCore = result.tools.filter((tool) => CORE_COMMANDS.has(tool.command) && !tool.installed);
  const payload = {
    status: missingCore.length === 0 ? "ok" : "degraded",
    missingCoreCommands: missingCore.map((tool) => tool.command),
    tools: result.tools,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return missingCore.length === 0 ? 0 : 1;
  }

  process.stdout.write(`Drive Health Doctor: ${payload.status}\n`);
  for (const tool of result.tools) {
    const required = CORE_COMMANDS.has(tool.command) ? "required" : "optional";
    const state = tool.installed ? "installed" : tool.installHint ?? "missing";
    process.stdout.write(`- ${tool.command} (${required}): ${state}\n`);
  }

  return missingCore.length === 0 ? 0 : 1;
}
