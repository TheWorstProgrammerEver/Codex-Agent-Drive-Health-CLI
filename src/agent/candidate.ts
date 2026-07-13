import type { CandidateCommand, CandidateEvidence, CandidateRemedyProposal } from "./model.js";

const CANDIDATE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RISK_LEVELS = new Set(["low", "medium", "high"]);

export function parseCandidateProposal(output: string): CandidateRemedyProposal {
  const parsed = JSON.parse(extractJsonObject(output)) as unknown;
  assertCandidate(parsed);
  return parsed;
}

function extractJsonObject(output: string): string {
  const trimmed = output.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    return fenced[1].trim();
  }

  throw new Error("Codex candidate output did not contain a JSON object.");
}

function assertCandidate(value: unknown): asserts value is CandidateRemedyProposal {
  if (!isRecord(value)) {
    throw new Error("Candidate output must be a JSON object.");
  }

  const schemaVersion = readStringField(value, "schemaVersion");
  if (schemaVersion !== "drive-health.candidate-remedy.v1") {
    throw new Error("Candidate output has an unsupported schemaVersion.");
  }

  const id = readStringField(value, "id");
  if (!CANDIDATE_ID_PATTERN.test(id)) {
    throw new Error("Candidate id must be a lowercase slug.");
  }

  readStringField(value, "title");
  readStringField(value, "summary");
  assertEvidenceArray(value.evidence);
  assertStringArray(value.compatibility, "compatibility", 1);
  assertRisk(value.risk);
  assertStringArray(value.rollback, "rollback", 1);
  assertCommandArray(value.proposedChecks, "proposedChecks");
  assertCommandArray(value.proposedApplyCommands, "proposedApplyCommands");
  assertTestsAndFixtures(value.testsAndFixtures);
  assertStringArray(value.promptChanges, "promptChanges", 0);
}

function readStringField(value: Record<string, unknown>, field: string): string {
  if (typeof value[field] !== "string" || value[field].trim().length === 0) {
    throw new Error(`Candidate field '${field}' must be a non-empty string.`);
  }
  return value[field];
}

function assertEvidenceArray(value: unknown): asserts value is CandidateEvidence[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Candidate field 'evidence' must contain at least one item.");
  }

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Candidate evidence item ${index} must be an object.`);
    }
    readStringField(entry, "source");
    readStringField(entry, "relevance");
    assertOptionalString(entry, "url");
    assertOptionalString(entry, "quote");
  });
}

function assertRisk(value: unknown): asserts value is CandidateRemedyProposal["risk"] {
  if (!isRecord(value)) {
    throw new Error("Candidate field 'risk' must be an object.");
  }

  if (typeof value.level !== "string" || !RISK_LEVELS.has(value.level)) {
    throw new Error("Candidate risk.level must be low, medium, or high.");
  }

  assertStringArray(value.notes, "risk.notes", 1);
}

function assertCommandArray(value: unknown, field: string): asserts value is CandidateCommand[] {
  if (!Array.isArray(value)) {
    throw new Error(`Candidate field '${field}' must be an array.`);
  }

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Candidate ${field} item ${index} must be an object.`);
    }
    readStringField(entry, "command");
    readStringField(entry, "reason");
  });
}

function assertTestsAndFixtures(value: unknown): asserts value is CandidateRemedyProposal["testsAndFixtures"] {
  if (!isRecord(value)) {
    throw new Error("Candidate field 'testsAndFixtures' must be an object.");
  }

  assertStringArray(value.tests, "testsAndFixtures.tests", 1);
  assertStringArray(value.fixtures, "testsAndFixtures.fixtures", 1);
}

function assertStringArray(value: unknown, field: string, minItems: number): asserts value is string[] {
  if (!Array.isArray(value) || value.length < minItems || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new Error(`Candidate field '${field}' must contain at least ${minItems} non-empty string item(s).`);
  }
}

function assertOptionalString(value: Record<string, unknown>, field: string): void {
  if (value[field] !== undefined && typeof value[field] !== "string") {
    throw new Error(`Candidate field '${field}' must be a string when present.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
