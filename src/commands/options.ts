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

const PROFILES = new Set<HostProfile>(["auto", "pi-usb-flash", "usb-ssd"]);

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

export function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliError(`Expected a value after ${flag}.`);
  }

  return value;
}

