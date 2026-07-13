# Codex-Agent-Drive-Health-CLI

`drive-health` is a read-only diagnostics CLI for Raspberry Pi agent hosts and
Daedalus-style Debian hosts. The first slice focuses on `check` and `doctor`;
future issues will add suggestion, apply, and learning workflows.

## Commands

```bash
npm install
npm run build
npm test
npm run drive-health -- check
npm run drive-health -- check --json
npm run drive-health -- doctor
```

The command shape is scaffolded as:

```bash
drive-health check [--json] [--target /] [--profile auto|pi-usb-flash|usb-ssd] [--include-identifiers]
drive-health suggest [--json] [--profile auto|pi-usb-flash|usb-ssd]
drive-health apply <remedy-id> [--dry-run] [--yes]
drive-health learn [--source local|docs|agent] [--open-pr]
drive-health doctor
```

Only `check` and basic `doctor` are implemented in this issue. `suggest`,
`apply`, and `learn` intentionally return a not-yet-implemented exit code.

## Report Safety

Shareable reports redact host-specific identifiers by default, including
serial-like identifiers, UUID/PARTUUID values, private user paths, local IP
addresses, and user-specific names. Use `--include-identifiers` only for local
troubleshooting.
