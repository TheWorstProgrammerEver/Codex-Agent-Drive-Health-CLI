import type { HostProfile } from "../report/model.js";
import { CliError, isHostProfile, readValue } from "./options.js";

export interface LearnOptions {
  source: "local" | "docs" | "agent";
  openPr: boolean;
  json: boolean;
  profile: HostProfile;
  candidatesDir: string;
  evidenceUrls: string[];
  topic?: string;
  reportFixture?: string;
  codexOutputDir?: string;
  codexCommand?: string;
  model?: string;
}

const LEARN_SOURCES = new Set<LearnOptions["source"]>(["local", "docs", "agent"]);

export function parseLearnOptions(args: string[]): LearnOptions {
  const options: LearnOptions = {
    source: "local",
    openPr: false,
    json: false,
    profile: "auto",
    candidatesDir: "candidate-remedies",
    evidenceUrls: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--open-pr") {
      options.openPr = true;
      continue;
    }

    if (arg === "--source") {
      const source = readValue(args, index, "--source");
      if (!LEARN_SOURCES.has(source as LearnOptions["source"])) {
        throw new CliError(`Unsupported learn source '${source}'.`);
      }
      options.source = source as LearnOptions["source"];
      index += 1;
      continue;
    }

    if (arg === "--profile") {
      const profile = readValue(args, index, "--profile");
      if (!isHostProfile(profile)) {
        throw new CliError(`Unsupported profile '${profile}'.`);
      }
      options.profile = profile;
      index += 1;
      continue;
    }

    if (arg === "--candidates-dir") {
      options.candidatesDir = readValue(args, index, "--candidates-dir");
      index += 1;
      continue;
    }

    if (arg === "--evidence-url") {
      options.evidenceUrls.push(readValue(args, index, "--evidence-url"));
      index += 1;
      continue;
    }

    if (arg === "--topic") {
      options.topic = readValue(args, index, "--topic");
      index += 1;
      continue;
    }

    if (arg === "--report-fixture") {
      options.reportFixture = readValue(args, index, "--report-fixture");
      index += 1;
      continue;
    }

    if (arg === "--codex-output-dir") {
      options.codexOutputDir = readValue(args, index, "--codex-output-dir");
      index += 1;
      continue;
    }

    if (arg === "--codex-command") {
      options.codexCommand = readValue(args, index, "--codex-command");
      index += 1;
      continue;
    }

    if (arg === "--model") {
      options.model = readValue(args, index, "--model");
      index += 1;
      continue;
    }

    throw new CliError(`Unknown learn option '${arg}'.`);
  }

  return options;
}
