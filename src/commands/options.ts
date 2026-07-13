import type { HostProfile } from "../report/model.js";

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 2,
  ) {
    super(message);
  }
}

export interface CheckOptions {
  json: boolean;
  target: string;
  profile: HostProfile;
  includeIdentifiers: boolean;
}

export interface SuggestOptions {
  json: boolean;
  profile: HostProfile;
}

export interface ApplyCliOptions {
  remedyId: string;
  dryRun: boolean;
  yes: boolean;
  profile: HostProfile;
  stateDir?: string;
}

const PROFILES = new Set<HostProfile>(["auto", "pi-usb-flash", "usb-ssd"]);

export function isHostProfile(value: string): value is HostProfile {
  return PROFILES.has(value as HostProfile);
}

export function parseCheckOptions(args: string[]): CheckOptions {
  const options: CheckOptions = {
    json: false,
    target: "/",
    profile: "auto",
    includeIdentifiers: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--include-identifiers") {
      options.includeIdentifiers = true;
      continue;
    }

    if (arg === "--target") {
      options.target = readValue(args, index, "--target");
      index += 1;
      continue;
    }

    if (arg === "--profile") {
      const profile = readValue(args, index, "--profile");
      if (!PROFILES.has(profile as HostProfile)) {
        throw new CliError(`Unsupported profile '${profile}'.`);
      }
      options.profile = profile as HostProfile;
      index += 1;
      continue;
    }

    throw new CliError(`Unknown check option '${arg}'.`);
  }

  return options;
}

export function parseSuggestOptions(args: string[]): SuggestOptions {
  const options: SuggestOptions = {
    json: false,
    profile: "auto",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--profile") {
      const profile = readValue(args, index, "--profile");
      if (!PROFILES.has(profile as HostProfile)) {
        throw new CliError(`Unsupported profile '${profile}'.`);
      }
      options.profile = profile as HostProfile;
      index += 1;
      continue;
    }

    throw new CliError(`Unknown suggest option '${arg}'.`);
  }

  return options;
}

export function parseApplyOptions(args: string[]): ApplyCliOptions {
  const remedyId = args[0];
  if (!remedyId || remedyId.startsWith("--")) {
    throw new CliError("Expected a remedy id after apply.");
  }

  const options: ApplyCliOptions = {
    remedyId,
    dryRun: true,
    yes: false,
    profile: "auto",
  };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--yes") {
      options.yes = true;
      options.dryRun = false;
      continue;
    }

    if (arg === "--profile") {
      const profile = readValue(args, index, "--profile");
      if (!PROFILES.has(profile as HostProfile)) {
        throw new CliError(`Unsupported profile '${profile}'.`);
      }
      options.profile = profile as HostProfile;
      index += 1;
      continue;
    }

    if (arg === "--state-dir") {
      options.stateDir = readValue(args, index, "--state-dir");
      index += 1;
      continue;
    }

    throw new CliError(`Unknown apply option '${arg}'.`);
  }

  return options;
}

export function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliError(`Expected a value after ${flag}.`);
  }

  return value;
}
