# Drive Health Candidate PR Summary

Write a concise GitHub pull request summary for a review-only Drive Health candidate remedy.

The summary is for reviewers deciding whether to promote a candidate into the curated executable/advisory remedy catalogue. It must be brief, concrete, and clear that generated content remains review-only.

## Output

Use this Markdown shape:

```markdown
## Summary
- ...

## Review Notes
- ...

## Validation
- ...
```

Mention the candidate artifact path, evidence quality, proposed tests/fixtures, and any prompt changes. Do not claim that the candidate is executable or already promoted.

## Candidate

```json
{{candidateJson}}
```

## Candidate Artifact Path

{{candidatePath}}

## Findings Explanation

{{explanationMarkdown}}
