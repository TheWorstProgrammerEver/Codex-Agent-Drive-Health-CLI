# Codex-Agent-Drive-Health-CLI

`drive-health` is a diagnostics and vetted-remedy CLI for Raspberry Pi agent
hosts and Daedalus-style Debian hosts. It collects read-only drive-health data,
suggests curated longevity remedies, and can apply a small allowlist of
low-risk changes with dry-run-first plans, backups, and verification.

## Commands

```bash
npm install
npm run build
npm test
npm run drive-health -- check
npm run drive-health -- check --json
npm run drive-health -- suggest
npm run drive-health -- apply limit-journald-disk-usage --dry-run
npm run drive-health -- learn --source local
npm run drive-health -- doctor
```

The command shape is scaffolded as:

```bash
drive-health check [--json] [--target /] [--profile auto|pi-usb-flash|usb-ssd] [--include-identifiers]
drive-health suggest [--json] [--profile auto|pi-usb-flash|usb-ssd]
drive-health apply <remedy-id> [--dry-run] [--yes]
drive-health learn [--source local|docs|agent] [--open-pr] [--report-fixture PATH] [--codex-output-dir PATH]
drive-health doctor
```

`check`, `suggest`, dry-run `apply`, `learn`, and basic `doctor` are
implemented.

`apply` defaults to dry-run. Non-dry-run execution requires `--yes`, and only
executable remedies in the curated catalogue can change files or service state.
Riskier remedies remain advisory and print concrete review commands without
executing them.

## Remedy Catalogue

Curated remedies live under `remedies/<remedy-id>/remedy.md`, with executable
metadata in `src/remedies/catalogue.ts`. Markdown owns rationale, risks,
compatibility, verification, and rollback notes; TypeScript owns detection,
selection, idempotence, backups, and command execution. The apply engine uses
static allowlisted commands only.

## Prompt Workflow

Editable agent prompts live under `prompts/`:

- `explain-findings.md`
- `research-remedy.md`
- `pr-summary.md`

`drive-health learn` hydrates those prompts with a redacted structured report
and curated remedy metadata. The default runner calls `codex exec` with a
read-only sandbox and no approval prompts. Tests and repeatable dry-runs can use
`--codex-output-dir` to read mocked Codex outputs from files instead of calling
Codex.

Candidate remedies are written under `candidate-remedies/<candidate-id>/`.
That directory is review-only: `drive-health apply` does not load it, and
generated proposed commands are stored as Markdown/JSON review text. Promotion
requires a normal code review that adds a curated remedy and TypeScript
metadata under the active catalogue.

`learn --open-pr` prepares a PR workflow packet inside the candidate directory,
including a branch name, commit message, PR summary, and suggested git/GitHub
commands. It does not run those commands automatically.

## Report Safety

Shareable reports redact host-specific identifiers by default, including
serial-like identifiers, UUID/PARTUUID values, private user paths, local IP
addresses, and user-specific names. Use `--include-identifiers` only for local
troubleshooting.
