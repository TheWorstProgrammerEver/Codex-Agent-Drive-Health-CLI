## Summary
- Adds a review-only candidate for auditing apt periodic cache cleanup policy.
- Keeps proposed commands in candidate artifacts only; nothing is promoted into the executable catalogue.

## Review Notes
- Evidence is limited to the sanitized report and Debian apt periodic documentation.
- The candidate should remain advisory unless future tests prove a safe idempotent configuration path.

## Validation
- Proposed unit fixtures cover large apt cache reports and apt periodic config snippets.
