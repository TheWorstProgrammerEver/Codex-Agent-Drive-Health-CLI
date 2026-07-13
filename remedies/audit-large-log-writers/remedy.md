# Audit Large Log Writers

## Rationale

Large logs should be attributed before broad logging changes are made. This
keeps the first response diagnostic: identify chatty services, then choose a
targeted logging or retention policy.

## Compatibility

Use on systemd hosts with journald and a conventional `/var/log` tree.

## Risks

Audit commands can read sensitive log summaries. Share reports only after
redaction review.

## Exact Commands For Manual Review

- `journalctl --disk-usage`
- `du -xhd1 /var/log`
- `journalctl --since -24h --no-pager`

## Files Or State Touched

- advisory only

## Backup

Not applicable. This remedy does not change files or services.

## Verification

Confirm the largest log paths and chatty services before changing retention,
storage mode, or service-specific logging.

## Rollback

Not applicable. This remedy is read-only.
