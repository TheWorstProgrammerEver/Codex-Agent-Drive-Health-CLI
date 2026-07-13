import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PromptName } from "./model.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROMPT_DIR = join(MODULE_DIR, "../../../prompts");
const DEFAULT_SCHEMA_PATH = join(MODULE_DIR, "../../../schemas/candidate-remedy.schema.json");

export function defaultPromptDir(): string {
  return DEFAULT_PROMPT_DIR;
}

export function defaultCandidateSchemaPath(): string {
  return DEFAULT_SCHEMA_PATH;
}

export async function hydratePromptFile(
  promptName: PromptName,
  variables: Record<string, string>,
  promptDir = DEFAULT_PROMPT_DIR,
): Promise<string> {
  const template = await readFile(join(promptDir, `${promptName}.md`), "utf8");
  return hydrateTemplate(template, variables);
}

export function hydrateTemplate(template: string, variables: Record<string, string>): string {
  const hydrated = Object.entries(variables).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
  const missing = [...hydrated.matchAll(/{{([a-zA-Z0-9]+)}}/g)].map((match) => match[1]);

  if (missing.length > 0) {
    throw new Error(`Missing prompt variables: ${[...new Set(missing)].join(", ")}.`);
  }

  return hydrated;
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
