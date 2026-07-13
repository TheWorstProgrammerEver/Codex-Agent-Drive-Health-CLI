import type { DriveHealthReport } from "../report/model.js";

export type PromptName = "explain-findings" | "research-remedy" | "pr-summary";

export interface CodexRunInput {
  promptName: PromptName;
  prompt: string;
}

export interface CodexRunOutput {
  text: string;
}

export interface CodexRunner {
  run(input: CodexRunInput): Promise<CodexRunOutput>;
}

export interface CandidateEvidence {
  source: string;
  url?: string;
  quote?: string;
  relevance: string;
}

export interface CandidateCommand {
  command: string;
  reason: string;
}

export interface CandidateRemedyProposal {
  schemaVersion: "drive-health.candidate-remedy.v1";
  id: string;
  title: string;
  summary: string;
  evidence: CandidateEvidence[];
  compatibility: string[];
  risk: {
    level: "low" | "medium" | "high";
    notes: string[];
  };
  rollback: string[];
  proposedChecks: CandidateCommand[];
  proposedApplyCommands: CandidateCommand[];
  testsAndFixtures: {
    tests: string[];
    fixtures: string[];
  };
  promptChanges: string[];
}

export interface AgentPromptContext {
  report: DriveHealthReport;
  remedyMetadata: CuratedRemedyMetadata[];
}

export interface CuratedRemedyMetadata {
  id: string;
  title: string;
  summary: string;
  markdownPath: string;
  findingIds: string[];
  mode: string;
  risk: string;
  prechecks: string[];
  reviewCommands: CandidateCommand[];
  filesTouched: string[];
  verification: string[];
  rollback: string[];
}

export interface LearnWorkflowOptions {
  report: DriveHealthReport;
  runner: CodexRunner;
  candidatesDir: string;
  source: "local" | "docs" | "agent";
  openPr: boolean;
  topic?: string;
  evidenceUrls: string[];
  now?: Date;
  promptDir?: string;
  schemaPath?: string;
}

export interface CandidateArtifactPaths {
  root: string;
  candidateJson: string;
  remedyMarkdown: string;
  evidenceMarkdown: string;
  compatibilityMarkdown: string;
  riskMarkdown: string;
  rollbackMarkdown: string;
  proposedChecksMarkdown: string;
  proposedApplyCommandsMarkdown: string;
  testsAndFixturesMarkdown: string;
  sanitizedReportFixture: string;
  remedyMetadataFixture: string;
  explanationMarkdown: string;
  researchOutputJson: string;
  prSummaryMarkdown: string;
  prWorkflowMarkdown?: string;
}

export interface LearnWorkflowResult {
  candidate: CandidateRemedyProposal;
  explanation: string;
  prSummary: string;
  paths: CandidateArtifactPaths;
  reportRedacted: boolean;
}
