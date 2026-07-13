import type { DriveHealthReport } from "./model.js";

const REDACTION_RULES = [
  "serial-like identifiers",
  "UUID and PARTUUID values",
  "private user paths",
  "local IP addresses",
  "current user and host names",
];

export function redactionRules(): string[] {
  return [...REDACTION_RULES];
}

export function redactReport(report: DriveHealthReport, includeIdentifiers: boolean): DriveHealthReport {
  if (includeIdentifiers) {
    return {
      ...report,
      redaction: {
        identifiersIncluded: true,
        redacted: false,
        rules: redactionRules(),
      },
    };
  }

  const redacted = redactValue(report, "", sensitiveStrings(report)) as DriveHealthReport;
  redacted.redaction = {
    identifiersIncluded: false,
    redacted: true,
    rules: redactionRules(),
  };
  return redacted;
}

function redactValue(value: unknown, key: string, sensitiveValues: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, key, sensitiveValues));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        shouldRedactByKey(entryKey) ? "[redacted-identifier]" : redactValue(entryValue, entryKey, sensitiveValues),
      ]),
    );
  }

  if (typeof value === "string") {
    return redactString(value, key, sensitiveValues);
  }

  return value;
}

function shouldRedactByKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "hostname" ||
    normalized === "serial" ||
    normalized === "uuid" ||
    normalized === "partuuid" ||
    normalized === "wwn" ||
    normalized === "label" ||
    normalized.endsWith("serial") ||
    normalized.endsWith("uuid") ||
    normalized.endsWith("partuuid")
  );
}

function redactString(value: string, key: string, sensitiveValues: string[]): string {
  if (shouldRedactByKey(key)) {
    return "[redacted-identifier]";
  }

  return redactSensitiveValues(redactUserIdentifiers(redactLocalIps(redactPrivatePaths(value))), sensitiveValues);
}

function redactPrivatePaths(value: string): string {
  return value
    .replace(/\b(uid|gid|user_id|group_id)=\d+\b/g, "$1=[redacted-id]")
    .replace(/\/tmp\/systemd-private-[^'\s:]+/g, "/tmp/[redacted-private]")
    .replace(/\/home\/[^/\s:]+/g, "/home/[redacted-user]")
    .replace(/\/root(?=\/|\b)/g, "/root/[redacted]")
    .replace(/\/media\/[^/\s:]+/g, "/media/[redacted-user]")
    .replace(/\/run\/user\/\d+/g, "/run/user/[redacted-uid]");
}

function redactLocalIps(value: string): string {
  return value
    .replace(/\b10(?:\.\d{1,3}){3}\b/g, "[redacted-local-ip]")
    .replace(/\b192\.168(?:\.\d{1,3}){2}\b/g, "[redacted-local-ip]")
    .replace(/\b172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}\b/g, "[redacted-local-ip]")
    .replace(/\b(?:fe80|fc[0-9a-f]{2}|fd[0-9a-f]{2}):[0-9a-f:]+\b/gi, "[redacted-local-ip]");
}

function redactUserIdentifiers(value: string): string {
  const userNames = [process.env.USER, process.env.LOGNAME]
    .filter((entry): entry is string => Boolean(entry && entry.length > 1))
    .map(escapeRegExp);

  if (userNames.length === 0) {
    return value;
  }

  return value.replace(new RegExp(`\\b(${userNames.join("|")})\\b`, "g"), "[redacted-user]");
}

function redactSensitiveValues(value: string, sensitiveValues: string[]): string {
  return sensitiveValues.reduce(
    (result, sensitive) => result.replace(new RegExp(escapeRegExp(sensitive), "g"), "[redacted-identifier]"),
    value,
  );
}

function sensitiveStrings(report: DriveHealthReport): string[] {
  return [...new Set([
    report.host.hostname,
    process.env.USER,
    process.env.LOGNAME,
  ].filter((entry): entry is string => Boolean(entry && entry.length > 2)))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
