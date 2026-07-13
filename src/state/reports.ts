import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DriveHealthReport } from "../report/model.js";

export const DEFAULT_STATE_DIR = "/var/lib/drive-health";
export const DEFAULT_REPORT_RETENTION_COUNT = 30;

const REPORT_FILE_PATTERN = /^check-\d{8}T\d{6}Z\.json$/;

export interface WriteReportOptions {
  stateDir: string;
  report: DriveHealthReport;
  retentionCount: number;
  now?: Date;
}

export interface WriteReportResult {
  reportPath: string;
  removedReports: string[];
}

export function reportsDir(stateDir: string): string {
  return join(stateDir, "reports");
}

export async function writeReport(options: WriteReportOptions): Promise<WriteReportResult> {
  const directory = reportsDir(options.stateDir);
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const reportPath = join(directory, `check-${compactTimestamp(options.now ?? new Date())}.json`);
  await writeFile(reportPath, `${JSON.stringify(options.report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  const removedReports = await pruneReports(directory, options.retentionCount);
  return { reportPath, removedReports };
}

export async function pruneReports(directory: string, retentionCount: number): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const reports = entries
    .filter((entry) => entry.isFile() && REPORT_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const stale = reports.slice(0, Math.max(0, reports.length - retentionCount));
  await Promise.all(stale.map((name) => rm(join(directory, name), { force: true })));
  return stale.map((name) => join(directory, name));
}

export function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
