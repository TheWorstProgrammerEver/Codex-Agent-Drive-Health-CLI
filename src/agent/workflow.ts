import { readFile } from "node:fs/promises";
import { buildAgentPromptContext } from "./context.js";
import { parseCandidateProposal } from "./candidate.js";
import { writeCandidateArtifacts } from "./artifacts.js";
import {
  defaultCandidateSchemaPath,
  hydratePromptFile,
  prettyJson,
} from "./prompts.js";
import type { LearnWorkflowOptions, LearnWorkflowResult } from "./model.js";

export async function runLearnWorkflow(options: LearnWorkflowOptions): Promise<LearnWorkflowResult> {
  const generatedAt = options.now ?? new Date();
  const context = buildAgentPromptContext(options.report);
  const candidateSchema = await readFile(options.schemaPath ?? defaultCandidateSchemaPath(), "utf8");
  const topic = options.topic ?? defaultTopic(options.source);
  const evidence = options.evidenceUrls.map((url) => ({ url }));

  const explainPrompt = await hydratePromptFile("explain-findings", {
    reportJson: prettyJson(context.report),
    remedyMetadataJson: prettyJson(context.remedyMetadata),
  }, options.promptDir);
  const explanation = (await options.runner.run({ promptName: "explain-findings", prompt: explainPrompt })).text;

  const researchPrompt = await hydratePromptFile("research-remedy", {
    topic,
    candidateSchemaJson: candidateSchema.trim(),
    reportJson: prettyJson(context.report),
    remedyMetadataJson: prettyJson(context.remedyMetadata),
    explanationMarkdown: explanation.trim(),
    evidenceJson: prettyJson(evidence),
  }, options.promptDir);
  const researchOutput = (await options.runner.run({ promptName: "research-remedy", prompt: researchPrompt })).text;
  const candidate = parseCandidateProposal(researchOutput);

  const preliminaryPath = `${options.candidatesDir}/${candidate.id}`;
  const prPrompt = await hydratePromptFile("pr-summary", {
    candidateJson: prettyJson(candidate),
    candidatePath: preliminaryPath,
    explanationMarkdown: explanation.trim(),
  }, options.promptDir);
  const prSummary = (await options.runner.run({ promptName: "pr-summary", prompt: prPrompt })).text;

  const paths = await writeCandidateArtifacts({
    candidate,
    candidatesDir: options.candidatesDir,
    sanitizedReport: context.report,
    remedyMetadata: context.remedyMetadata,
    explanation,
    researchOutput,
    prSummary,
    openPr: options.openPr,
    generatedAt,
  });

  return {
    candidate,
    explanation,
    prSummary,
    paths,
    reportRedacted: context.report.redaction.redacted,
  };
}

function defaultTopic(source: "local" | "docs" | "agent"): string {
  switch (source) {
    case "docs":
      return "Research a new drive-health remedy from provided documentation links.";
    case "agent":
      return "Generate a candidate remedy from agent research notes and sanitized report evidence.";
    case "local":
      return "Identify any local drive-health remedy gap from the sanitized report and curated catalogue.";
  }
}
