# Enable And Verify Weekly fstrim

## Rationale

Periodic TRIM can help SSDs and some USB storage stacks reclaim unused blocks
without adding continuous discard overhead to normal writes. This remedy keeps
TRIM periodic through `fstrim.timer`.

## Compatibility

Use only when `lsblk` advertises discard support and `fstrim --dry-run`
reports at least one filesystem target. If discard is not advertised, or the
dry-run output is empty, the CLI reports this as advisory.

## Risks

Some USB bridges hide or misreport discard support. A timer being enabled does
not prove that the storage stack actually performs TRIM.

## Exact Commands

- `systemctl enable --now fstrim.timer`
- `systemctl is-enabled fstrim.timer`
- `systemctl is-active fstrim.timer`
- `fstrim --listed-in /etc/fstab:/proc/self/mountinfo --verbose --dry-run`

## Files Or State Touched

- systemd timer enablement state for `fstrim.timer`
- backup audit record under `$STATE_DIR/backups/<timestamp>-enable-weekly-fstrim/`

## Backup

The apply engine records the prior `fstrim.timer` state as
`fstrim.timer.before.json` before changing timer state.

## Verification

The timer must be enabled, active, and still able to produce a safe dry-run
probe after the change.

## Rollback

If the timer was not previously enabled, run
`systemctl disable --now fstrim.timer`.
