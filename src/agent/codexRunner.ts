import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { CodexRunner, CodexRunInput, CodexRunOutput, PromptName } from "./model.js";

export interface CodexCliRunnerOptions {
  command?: string;
  cwd?: string;
  model?: string;
  timeoutMs?: number;
}

export function createCodexCliRunner(options: CodexCliRunnerOptions = {}): CodexRunner {
  return {
    async run(input: CodexRunInput): Promise<CodexRunOutput> {
      const tempDir = await mkdtemp(join(tmpdir(), "drive-health-codex-"));
      const outputPath = join(tempDir, `${input.promptName}.md`);
      try {
        const args = [
          "exec",
          "--ephemeral",
          "-c",
          "approval_policy=\"never\"",
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          "--output-last-message",
          outputPath,
        ];

        if (options.model) {
          args.push("--model", options.model);
        }

        args.push("-");

        await runProcess({
          command: options.command ?? "codex",
          args,
          cwd: options.cwd ?? process.cwd(),
          input: input.prompt,
          timeoutMs: options.timeoutMs ?? 10 * 60 * 1000,
        });

        return { text: await readFile(outputPath, "utf8") };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  };
}

export function createFixtureCodexRunner(outputDir: string): CodexRunner {
  return {
    async run(input: CodexRunInput): Promise<CodexRunOutput> {
      return { text: await readFile(fixturePath(outputDir, input.promptName), "utf8") };
    },
  };
}

interface ProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  input: string;
  timeoutMs: number;
}

function runProcess(options: ProcessOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${options.command} timed out after ${options.timeoutMs}ms.`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (exitCode === 0) {
        resolve();
        return;
      }

      const output = Buffer.concat([...stdout, ...stderr]).toString("utf8").trim();
      reject(new Error(`${options.command} exited with ${exitCode ?? "no status"}.${output ? `\n${output}` : ""}`));
    });

    child.stdin.end(options.input);
  });
}

function fixturePath(outputDir: string, promptName: PromptName): string {
  return join(outputDir, promptName === "research-remedy" ? `${promptName}.json` : `${promptName}.md`);
}
