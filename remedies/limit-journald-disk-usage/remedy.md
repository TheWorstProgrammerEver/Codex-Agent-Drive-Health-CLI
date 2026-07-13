# Limit Persistent Journald Disk Usage

## Rationale

Persistent journald is useful, but unbounded logs can create avoidable writes
and consume storage. This remedy adds a small drop-in with explicit size
limits while leaving storage mode unchanged.

## Compatibility

Use on systemd hosts where journald state and disk usage can be collected.
This remedy does not switch to volatile logging; it only bounds persistent and
runtime journal usage.

## Risks

Very small limits can remove old logs sooner than expected. Hosts that rely on
long local log retention should choose larger site-specific limits.

## Exact Commands

- `systemd-analyze cat-config systemd/journald.conf`
- `systemctl restart systemd-journald.service`
- `journalctl --disk-usage`

## Files Or State Touched

- `/etc/systemd/journald.conf.d/90-drive-health-limits.conf`

The managed file content is:

```ini
# Managed by drive-health remedy limit-journald-disk-usage.
[Journal]
SystemMaxUse=256M
SystemKeepFree=1G
RuntimeMaxUse=128M
```

## Backup

Before writing, the apply engine backs up the existing drop-in to
`$STATE_DIR/backups/<timestamp>-limit-journald-disk-usage/90-drive-health-limits.conf.before`.
If no drop-in existed, it records an absence marker beside the backup path.

## Verification

The apply engine validates the combined journald config with
`systemd-analyze cat-config systemd/journald.conf`, restarts only
`systemd-journald.service`, then verifies journald is readable with
`journalctl --disk-usage`.

## Rollback

Restore the backed-up drop-in if one existed. If the file was newly created,
remove `/etc/systemd/journald.conf.d/90-drive-health-limits.conf`. Restart
`systemd-journald.service` after restoring the prior file state.
