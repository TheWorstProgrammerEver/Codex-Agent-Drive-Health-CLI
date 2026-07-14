# Routine Systemd Runner

`drive-health runner` installs reviewable systemd unit files for routine
read-only checks. It never enables or starts the timer automatically.

## Install Flow

Generate host-neutral examples:

```bash
drive-health runner template
```

Install user-scope unit files for review:

```bash
drive-health runner install \
  --scope user \
  --bin /usr/local/bin/drive-health \
  --profile pi-usb-flash
```

Dry-run the same write under a temporary root:

```bash
drive-health runner install \
  --dry-run \
  --root /tmp/drive-health-root \
  --scope user \
  --bin /usr/local/bin/drive-health \
  --state-dir %h/.local/state/drive-health
```

The install command writes:

```text
/etc/systemd/user/drive-health-check.service
/etc/systemd/user/drive-health-check.timer
```

For `--scope system`, it writes the same filenames under
`/etc/systemd/system`.

After reviewing the files, enable them explicitly:

```bash
systemctl --user daemon-reload
systemctl --user enable --now drive-health-check.timer
```

For system scope, omit `--user`. User timers that must run without an active
login session also need operator-managed lingering for the target account.

## Placeholder Expansion

The generated example units contain placeholders:

```text
__DRIVE_HEALTH_BIN_ABSOLUTE_PATH__
__DRIVE_HEALTH_STATE_DIR__
```

Those placeholders are documentation only. Replace them before installing unit
files. `ExecStart=` does not run through a shell, so do not rely on shell-only
forms such as `~`, `$HOME`, or command aliases. For user units, `%h` is a
systemd specifier and is suitable for paths such as
`%h/.local/state/drive-health`.

The runner service always invokes `drive-health check`; it does not run
`suggest`, `learn`, or `apply`, and it does not pass `--include-identifiers`.

## State Directory

The default state directory for direct CLI writes is:

```text
/var/lib/drive-health
```

The user-scope runner default is:

```text
%h/.local/state/drive-health
```

State layout:

```text
$STATE_DIR/
  reports/
    check-YYYYMMDDTHHMMSSZ.json
  backups/
    <timestamp>-<remedy-id>/
```

Routine reports are redacted by default and are written with `0600` file mode.
The service uses `UMask=077`. Report retention is bounded with
`--retention-count`; the default is 30 reports.

## Doctor And Uninstall

Validate dependencies and unit files:

```bash
drive-health doctor --runner-scope user
drive-health doctor --json --runner-scope user
```

`doctor` reports a non-installed runner as informational. It reports stale or
invalid service/timer files as degraded, including unsafe service files that
invoke anything other than read-only `check`.

Remove unit files without changing enablement state:

```bash
drive-health runner uninstall --scope user
```

If the timer was enabled, disable it explicitly before or after removing files:

```bash
systemctl --user disable --now drive-health-check.timer
systemctl --user daemon-reload
```
