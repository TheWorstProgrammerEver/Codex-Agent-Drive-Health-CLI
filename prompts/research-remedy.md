# Drive Health Candidate Remedy Research

You are proposing a review-only candidate remedy for the Drive Health CLI.

Use only the sanitized report, curated remedy metadata, findings explanation, and evidence links below. The output will be written under `candidate-remedies/` for human review. It must not promote anything into the active `remedies/` catalogue and must not ask the CLI to execute generated commands.

## Candidate Topic

{{topic}}

## Required Output

Return exactly one JSON object matching the candidate schema. Do not wrap it in Markdown.

The candidate must include:

- evidence and source links where available;
- compatibility notes for Debian/Raspberry Pi and write-sensitive USB/SSD hosts;
- risk level and concrete risk notes;
- rollback guidance;
- proposed read-only checks;
- proposed apply commands as text for review only;
- proposed tests and fixtures;
- prompt or documentation changes that reviewers should consider.

If the evidence is weak, set `risk.level` appropriately and include a review note instead of overstating confidence.

## Candidate Schema

```json
{{candidateSchemaJson}}
```

## Sanitized Report

```json
{{reportJson}}
```

## Curated Remedy Metadata

```json
{{remedyMetadataJson}}
```

## Findings Explanation

{{explanationMarkdown}}

## Evidence Links

```json
{{evidenceJson}}
```
