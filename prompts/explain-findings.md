# Drive Health Findings Explanation

You are helping review a drive-health report for a write-sensitive Debian or Raspberry Pi host.

Use only the sanitized structured report and curated remedy metadata below. Do not assume access to raw host data, shell output, unredacted identifiers, or files outside this prompt.

## Output

Write concise Markdown with these sections:

- `Summary`: the most important health and write-pressure observations.
- `Ranked Findings`: ordered by urgency and confidence.
- `Remedy Fit`: which curated remedies appear relevant, already applied, advisory, or unsupported.
- `Research Leads`: questions or evidence links that would help decide whether a new candidate remedy is worth review.
- `Safety Notes`: any reason automated apply should not be expanded without human review.

Keep the response practical and review-oriented. Do not include shell commands except when they already appear in the curated remedy metadata.

## Sanitized Report

```json
{{reportJson}}
```

## Curated Remedy Metadata

```json
{{remedyMetadataJson}}
```
