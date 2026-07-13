#!/usr/bin/env node
import { runApply } from "./commands/apply.js";
import { runCheck } from "./commands/check.js";
import { runDoctor } from "./commands/doctor.js";
import { runLearn } from "./commands/learn.js";
import { CliError } from "./commands/options.js";
import { runRunner } from "./commands/runner.js";
import { runSuggest } from "./commands/suggest.js";

const HELP = `drive-health

Usage:
  drive-health check [--json] [--target /] [--profile auto|pi-usb-flash|usb-ssd] [--include-identifiers] [--write-report] [--quiet] [--state-dir PATH] [--retention-count N]
  drive-health suggest [--json] [--profile auto|pi-usb-flash|usb-ssd]
  drive-health apply <remedy-id> [--dry-run] [--yes] [--state-dir PATH]
  drive-health learn [--source local|docs|agent] [--open-pr] [--report-fixture PATH] [--codex-output-dir PATH]
  drive-health runner template
  drive-health runner install [--dry-run] [--scope user|system] [--bin PATH] [--state-dir PATH] [--root PATH]
  drive-health runner uninstall [--dry-run] [--scope user|system] [--root PATH]
  drive-health doctor [--json] [--runner-scope user|system] [--root PATH]
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
      return runSuggest(args);
    case "apply":
      return runApply(args);
    case "learn":
      return runLearn(args);
    case "runner":
      return runRunner(args);
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
