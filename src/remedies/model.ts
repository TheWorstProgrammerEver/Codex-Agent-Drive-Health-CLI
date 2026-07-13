import type { FindingSeverity } from "../report/model.js";

export type RemedyId =
  | "enable-weekly-fstrim"
  | "set-root-noatime"
  | "limit-journald-disk-usage"
  | "prefer-zram-over-disk-swap"
  | "clean-package-cache"
  | "audit-large-log-writers";

export type RemedyMode = "executable" | "advisory";
export type RemedyRisk = "low" | "medium" | "high";
export type RemedySuggestionStatus = "recommended" | "already-applied" | "advisory" | "unsupported";

export interface RemedyCommand {
  command: string;
  args: string[];
  reason: string;
}

export interface ExecutableRemedyDeclaration {
  prechecks: string[];
  commands: RemedyCommand[];
  filesTouched: string[];
  backupPath: string;
  verification: string[];
  rollback: string[];
}

export interface AdvisoryRemedyDeclaration {
  commands: RemedyCommand[];
  filesTouched: string[];
  backupPath: string;
  verification: string[];
  rollback: string[];
}

export interface RemedyMetadata {
  id: RemedyId;
  title: string;
  summary: string;
  markdownPath: string;
  findingIds: string[];
  mode: RemedyMode;
  risk: RemedyRisk;
  executable?: ExecutableRemedyDeclaration;
  advisory?: AdvisoryRemedyDeclaration;
}

export interface RemedySuggestion {
  remedy: RemedyMetadata;
  status: RemedySuggestionStatus;
  severity: FindingSeverity;
  reason: string;
  evidence?: Record<string, unknown>;
}

export interface PlannedChange {
  kind: "file" | "command" | "backup" | "verification" | "advisory";
  description: string;
  path?: string;
  command?: string;
}

export type ApplyStatus =
  | "dry-run"
  | "applied"
  | "already-applied"
  | "advisory"
  | "unsupported"
  | "confirmation-required"
  | "failed";

export interface ApplyResult {
  remedy: RemedyMetadata;
  status: ApplyStatus;
  dryRun: boolean;
  reason: string;
  prechecks: string[];
  plannedChanges: PlannedChange[];
  backups: string[];
  filesChanged: string[];
  commandsRun: string[];
  verification: string[];
  rollback: string[];
  error?: string;
}
