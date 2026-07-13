# Remedy Catalogue

Each curated remedy lives under `remedies/<remedy-id>/remedy.md`.

Markdown owns the human-facing material:

- rationale
- risk notes
- compatibility
- exact commands and files for operator review
- verification
- rollback

TypeScript under `src/remedies/` owns detection, selection, dry-run planning,
idempotence, backups, and execution. Executable remedies use only static
allowlisted commands from the catalogue metadata; prompt-generated shell is not
accepted by the apply engine.
