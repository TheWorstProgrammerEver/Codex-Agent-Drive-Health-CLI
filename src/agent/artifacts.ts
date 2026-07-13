import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CandidateArtifactPaths,
  CandidateRemedyProposal,
  CuratedRemedyMetadata,
} from "./model.js";
import type { DriveHealthReport } from "../report/model.js";
import {
  ensureTrailingNewline,
  renderCandidateMarkdown,
  renderCommands,
  renderEvidence,
  renderListPage,
  renderPrWorkflow,
  renderRisk,
  renderTestsAndFixtures,
} from "./artifactMarkdown.js";
import { prettyJson } from "./prompts.js";

export interface WriteCandidateArtifactsOptions {
  candidate: CandidateRemedyProposal;
  candidatesDir: string;
  sanitizedReport: DriveHealthReport;
  remedyMetadata: CuratedRemedyMetadata[];
  explanation: string;
  researchOutput: string;
  prSummary: string;
  openPr: boolean;
  generatedAt: Date;
}

export async function writeCandidateArtifacts(options: WriteCandidateArtifactsOptions): Promise<CandidateArtifactPaths> {
  const root = join(options.candidatesDir, options.candidate.id);
  const paths = pathsFor(root, options.openPr);

  await mkdir(root, { recursive: true });
  await mkdir(join(root, "agent"), { recursive: true });
  await mkdir(join(root, "fixtures"), { recursive: true });
  if (options.openPr) {
    await mkdir(join(root, "pr"), { recursive: true });
  }

  await Promise.all([
    writeFile(paths.candidateJson, `${prettyJson(options.candidate)}\n`, "utf8"),
    writeFile(paths.remedyMarkdown, renderCandidateMarkdown(options.candidate, options.generatedAt), "utf8"),
    writeFile(paths.evidenceMarkdown, renderEvidence(options.candidate), "utf8"),
    writeFile(paths.compatibilityMarkdown, renderListPage("Compatibility", options.candidate.compatibility), "utf8"),
    writeFile(paths.riskMarkdown, renderRisk(options.candidate), "utf8"),
    writeFile(paths.rollbackMarkdown, renderListPage("Rollback", options.candidate.rollback), "utf8"),
    writeFile(paths.proposedChecksMarkdown, renderCommands("Proposed Checks", options.candidate.proposedChecks), "utf8"),
    writeFile(paths.proposedApplyCommandsMarkdown, renderCommands("Proposed Apply Commands", options.candidate.proposedApplyCommands), "utf8"),
    writeFile(paths.testsAndFixturesMarkdown, renderTestsAndFixtures(options.candidate), "utf8"),
    writeFile(paths.sanitizedReportFixture, `${prettyJson(options.sanitizedReport)}\n`, "utf8"),
    writeFile(paths.remedyMetadataFixture, `${prettyJson(options.remedyMetadata)}\n`, "utf8"),
    writeFile(paths.explanationMarkdown, ensureTrailingNewline(options.explanation), "utf8"),
    writeFile(paths.researchOutputJson, ensureTrailingNewline(options.researchOutput), "utf8"),
    writeFile(paths.prSummaryMarkdown, ensureTrailingNewline(options.prSummary), "utf8"),
  ]);

  if (options.openPr && paths.prWorkflowMarkdown) {
    await writeFile(paths.prWorkflowMarkdown, renderPrWorkflow(options.candidate, options.prSummary, root), "utf8");
  }

  return paths;
}

function pathsFor(root: string, openPr: boolean): CandidateArtifactPaths {
  return {
    root,
    candidateJson: join(root, "candidate.json"),
    remedyMarkdown: join(root, "remedy.md"),
    evidenceMarkdown: join(root, "evidence.md"),
    compatibilityMarkdown: join(root, "compatibility.md"),
    riskMarkdown: join(root, "risk.md"),
    rollbackMarkdown: join(root, "rollback.md"),
    proposedChecksMarkdown: join(root, "proposed-checks.md"),
    proposedApplyCommandsMarkdown: join(root, "proposed-apply-commands.md"),
    testsAndFixturesMarkdown: join(root, "tests-and-fixtures.md"),
    sanitizedReportFixture: join(root, "fixtures", "sanitized-report.json"),
    remedyMetadataFixture: join(root, "fixtures", "curated-remedy-metadata.json"),
    explanationMarkdown: join(root, "agent", "explanation.md"),
    researchOutputJson: join(root, "agent", "research-output.json"),
    prSummaryMarkdown: join(root, "pr-summary.md"),
    prWorkflowMarkdown: openPr ? join(root, "pr", "workflow.md") : undefined,
  };
}
