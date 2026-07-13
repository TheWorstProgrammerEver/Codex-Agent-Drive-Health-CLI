import { buildReport } from "../report/buildReport.js";
import { applyRemedy } from "../remedies/apply.js";
import { renderApplyResult } from "../remedies/render.js";
import { parseApplyOptions } from "./options.js";

export async function runApply(args: string[]): Promise<number> {
  const options = parseApplyOptions(args);
  const report = await buildReport({
    target: "/",
    profile: options.profile,
    includeIdentifiers: false,
  });

  if (!options.dryRun) {
    const plan = await applyRemedy({
      remedyId: options.remedyId,
      report,
      dryRun: true,
      confirmed: false,
      stateDir: options.stateDir ?? process.env.DRIVE_HEALTH_STATE_DIR,
    });
    process.stdout.write(renderApplyResult(plan));

    if (plan.status !== "dry-run") {
      process.stdout.write("No executable change is available for this host state; execution stopped after the advisory plan.\n");
      return 0;
    }

    process.stdout.write("Confirmed by --yes; executing the planned changes.\n\n");
  }

  const result = await applyRemedy({
    remedyId: options.remedyId,
    report,
    dryRun: options.dryRun,
    confirmed: options.yes,
    stateDir: options.stateDir ?? process.env.DRIVE_HEALTH_STATE_DIR,
  });

  process.stdout.write(renderApplyResult(result));

  return result.status === "failed" ? 1 : 0;
}
