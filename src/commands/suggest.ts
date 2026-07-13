import { buildReport } from "../report/buildReport.js";
import { renderSuggestions } from "../remedies/render.js";
import { selectRemedySuggestions } from "../remedies/selection.js";
import { parseSuggestOptions } from "./options.js";

export async function runSuggest(args: string[]): Promise<number> {
  const options = parseSuggestOptions(args);
  const report = await buildReport({
    target: "/",
    profile: options.profile,
    includeIdentifiers: false,
  });
  const suggestions = selectRemedySuggestions(report);

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "drive-health.suggestions.v1",
      generatedAt: report.generatedAt,
      profile: report.profile,
      suggestions,
      findings: report.findings,
    }, null, 2)}\n`);
  } else {
    process.stdout.write(renderSuggestions(suggestions));
  }

  return 0;
}
