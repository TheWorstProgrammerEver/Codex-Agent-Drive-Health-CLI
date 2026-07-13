import { readFile } from "node:fs/promises";
import { createCodexCliRunner, createFixtureCodexRunner } from "../agent/codexRunner.js";
import { runLearnWorkflow } from "../agent/workflow.js";
import { buildReport } from "../report/buildReport.js";
import type { DriveHealthReport } from "../report/model.js";
import { parseLearnOptions } from "./learnOptions.js";

export async function runLearn(args: string[]): Promise<number> {
  const options = parseLearnOptions(args);
  const report = options.reportFixture
    ? await readReportFixture(options.reportFixture)
    : await buildReport({
      target: "/",
      profile: options.profile,
      includeIdentifiers: false,
    });
  const runner = options.codexOutputDir
    ? createFixtureCodexRunner(options.codexOutputDir)
    : createCodexCliRunner({
      command: options.codexCommand,
      model: options.model,
    });

  const result = await runLearnWorkflow({
    report,
    runner,
    candidatesDir: options.candidatesDir,
    source: options.source,
    openPr: options.openPr,
    topic: options.topic,
    evidenceUrls: options.evidenceUrls,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "drive-health.learn-result.v1",
      candidate: result.candidate,
      reportRedacted: result.reportRedacted,
      paths: result.paths,
    }, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(renderLearnResult(
    result.candidate.id,
    result.paths.root,
    result.reportRedacted,
    Boolean(result.paths.prWorkflowMarkdown),
  ));
  return 0;
}

async function readReportFixture(path: string): Promise<DriveHealthReport> {
  return JSON.parse(await readFile(path, "utf8")) as DriveHealthReport;
}

function renderLearnResult(candidateId: string, candidatePath: string, redacted: boolean, prWorkflow: boolean): string {
  return [
    "Drive Health Learn",
    "",
    `Candidate: ${candidateId}`,
    `Path: ${candidatePath}`,
    `Report redacted: ${redacted ? "yes" : "no"}`,
    `PR workflow packet: ${prWorkflow ? "prepared" : "not requested"}`,
    "",
    "Review the candidate artifacts before promoting anything into the curated remedy catalogue.",
    "",
  ].join("\n");
}
