# Candidate Remedies

`drive-health learn` writes review-only candidate remedy artifacts here by default.

Candidate content is generated from sanitized structured reports, curated remedy
metadata, and editable Markdown prompts. The active apply engine does not read
this directory, and candidate proposed commands are stored as review text only.

Promotion requires a human-reviewed code change that adds a curated remedy under
`remedies/` and executable or advisory metadata under `src/remedies/`.
