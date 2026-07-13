import type { FindingSeverity } from "../report/model.js";
import type { ApplyResult, RemedySuggestion } from "./model.js";

const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  ok: "OK",
  info: "INFO",
  opportunity: "OPPORTUNITY",
  warning: "WARNING",
  critical: "CRITICAL",
  unsupported: "UNSUPPORTED",
};

export function renderSuggestions(suggestions: RemedySuggestion[]): string {
  const lines = [
    "Drive Health Suggestions",
    "",
    ...suggestions.map((suggestion) => {
      const mode = suggestion.remedy.mode === "executable" ? "executable" : "advisory";
      return `- [${SEVERITY_LABELS[suggestion.severity]}] ${suggestion.remedy.id} (${suggestion.status}, ${mode}): ${suggestion.reason}`;
    }),
    "",
  ];

  return lines.join("\n");
}

export function renderApplyResult(result: ApplyResult): string {
  const lines = [
    `Drive Health Apply: ${result.remedy.id}`,
    "",
    `Status: ${result.status}`,
    `Mode: ${result.dryRun ? "dry-run" : "confirmed execution"}`,
    `Risk: ${result.remedy.risk}`,
    `Reason: ${result.reason}`,
    "",
    "Prechecks:",
    ...listOrNone(result.prechecks.map((item) => `- ${item}`)),
    "",
    "Planned Changes:",
    ...listOrNone(result.plannedChanges.map((change) => `- ${change.description}${change.command ? ` (${change.command})` : ""}`)),
    "",
    "Backups:",
    ...listOrNone(result.backups.map((backup) => `- ${backup}`)),
    "",
    "Files Changed:",
    ...listOrNone(result.filesChanged.map((file) => `- ${file}`)),
    "",
    "Commands Run:",
    ...listOrNone(result.commandsRun.map((command) => `- ${command}`)),
    "",
    "Verification:",
    ...listOrNone(result.verification.map((item) => `- ${item}`)),
    "",
    "Rollback:",
    ...listOrNone(result.rollback.map((item) => `- ${item}`)),
  ];

  if (result.error) {
    lines.push("", `Error: ${result.error}`);
  }

  return `${lines.join("\n")}\n`;
}

function listOrNone(values: string[]): string[] {
  return values.length > 0 ? values : ["- none"];
}
