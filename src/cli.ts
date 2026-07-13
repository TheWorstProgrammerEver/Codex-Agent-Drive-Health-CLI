#!/usr/bin/env node
import { runCheck } from "./commands/check.js";
import { runDoctor } from "./commands/doctor.js";
import { CliError } from "./commands/options.js";
import { runNotImplemented } from "./commands/stubs.js";

const HELP = `drive-health

Usage:
  drive-health check [--json] [--target /] [--profile auto|pi-usb-flash|usb-ssd] [--include-identifiers]
  drive-health suggest [--json] [--profile auto|pi-usb-flash|usb-ssd]
  drive-health apply <remedy-id> [--dry-run] [--yes]
  drive-health learn [--source local|docs|agent] [--open-pr]
  drive-health doctor [--json]
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return 0;
  }

  switch (command) {
    case "check":
      return runCheck(args);
    case "doctor":
      return runDoctor(args);
    case "suggest":
    case "apply":
    case "learn":
      return runNotImplemented(command);
    default:
      throw new CliError(`Unknown command '${command}'.`);
  }
}

main(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = exitCode;
  });

