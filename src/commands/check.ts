import { buildReport } from "../report/buildReport.js";
import { renderHumanReport } from "../report/render.js";
import { parseCheckOptions } from "./options.js";

export async function runCheck(args: string[]): Promise<number> {
  const options = parseCheckOptions(args);
  const report = await buildReport({
    target: options.target,
    profile: options.profile,
    includeIdentifiers: options.includeIdentifiers,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderHumanReport(report));
  }

  return 0;
}

