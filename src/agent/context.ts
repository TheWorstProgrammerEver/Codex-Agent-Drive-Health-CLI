import { commandLabel } from "../adapters/command.js";
import { redactReport } from "../report/redact.js";
import { REMEDIES } from "../remedies/catalogue.js";
import type { AgentPromptContext, CuratedRemedyMetadata } from "./model.js";
import type { DriveHealthReport } from "../report/model.js";

export function buildAgentPromptContext(report: DriveHealthReport): AgentPromptContext {
  return {
    report: redactReport(report, false),
    remedyMetadata: curatedRemedyMetadata(),
  };
}

export function curatedRemedyMetadata(): CuratedRemedyMetadata[] {
  return REMEDIES.map((remedy) => {
    const declaration = remedy.executable ?? remedy.advisory;
    return {
      id: remedy.id,
      title: remedy.title,
      summary: remedy.summary,
      markdownPath: remedy.markdownPath,
      findingIds: [...remedy.findingIds],
      mode: remedy.mode,
      risk: remedy.risk,
      prechecks: remedy.executable?.prechecks ?? [],
      reviewCommands: (declaration?.commands ?? []).map((command) => ({
        command: commandLabel(command.command, command.args),
        reason: command.reason,
      })),
      filesTouched: [...(declaration?.filesTouched ?? [])],
      verification: [...(declaration?.verification ?? [])],
      rollback: [...(declaration?.rollback ?? [])],
    };
  });
}
