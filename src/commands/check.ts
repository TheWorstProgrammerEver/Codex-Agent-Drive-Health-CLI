import { buildReport } from "../report/buildReport.js";
import { renderHumanReport } from "../report/render.js";
import { DEFAULT_STATE_DIR, writeReport } from "../state/reports.js";
import { parseCheckOptions } from "./options.js";

export async function runCheck(args: string[]): Promise<number> {
  const options = parseCheckOptions(args);
  const report = await buildReport({
    target: options.target,
    profile: options.profile,
    includeIdentifiers: options.includeIdentifiers,
  });
  const reportWrite = options.writeReport
    ? await writeReport({
        stateDir: options.stateDir ?? process.env.DRIVE_HEALTH_STATE_DIR ?? DEFAULT_STATE_DIR,
        report,
        retentionCount: options.retentionCount,
      })
    : undefined;

  if (options.quiet) {
    return 0;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderHumanReport(report));
    if (reportWrite) {
      process.stdout.write(`Report written: ${reportWrite.reportPath}\n`);
      if (reportWrite.removedReports.length > 0) {
        process.stdout.write(`Removed stale reports: ${reportWrite.removedReports.length}\n`);
      }
    }
  }

  return 0;
}
