# Review Root noatime Policy

## Rationale

`noatime` can reduce metadata writes on flash-heavy hosts by avoiding access
time updates on reads. `relatime` is often an acceptable default compromise.

## Compatibility

This applies to root filesystems where workloads do not require precise access
time behavior. The first-pass catalogue keeps this advisory because editing
root `/etc/fstab` can affect boot and recovery.

## Risks

Incorrect root mount options can break boot, remount behavior, or application
assumptions. This should be reviewed alongside the existing filesystem type and
current `/etc/fstab` entry.

## Exact Commands For Manual Review

- `findmnt / --output TARGET,FSTYPE,OPTIONS,SOURCE`
- `findmnt --verify --tab-file /etc/fstab`
- `mount -o remount /`

## Files Or State Touched

- advisory only in this first pass
- a future executable version would touch `/etc/fstab`

## Backup

Not automated in this first pass. A future executable version must back up
`/etc/fstab` before writing.

## Verification

Verify `/etc/fstab`, remount root, and confirm `findmnt /` reports the intended
atime option.

## Rollback

Restore the previous `/etc/fstab` entry and remount root, or reboot into a
known-good boot profile if remount validation fails.
