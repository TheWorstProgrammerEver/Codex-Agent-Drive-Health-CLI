import type { RemedyId, RemedyMetadata } from "./model.js";

export const REMEDIES: readonly RemedyMetadata[] = [
  {
    id: "enable-weekly-fstrim",
    title: "Enable and verify weekly fstrim",
    summary: "Enable the systemd fstrim timer only when discard support is advertised and dry-run output is confirmed.",
    markdownPath: "remedies/enable-weekly-fstrim/remedy.md",
    findingIds: ["trim-support"],
    mode: "executable",
    risk: "low",
    executable: {
      prechecks: [
        "systemd is available",
        "block-device data advertises discard support",
        "fstrim dry-run reports at least one filesystem entry",
      ],
      commands: [
        {
          command: "systemctl",
          args: ["enable", "--now", "fstrim.timer"],
          reason: "Enable the existing periodic TRIM timer without running continuous discard.",
        },
        {
          command: "systemctl",
          args: ["is-enabled", "fstrim.timer"],
          reason: "Verify the timer remains enabled after the change.",
        },
        {
          command: "systemctl",
          args: ["is-active", "fstrim.timer"],
          reason: "Verify the timer is active after the change.",
        },
        {
          command: "fstrim",
          args: ["--listed-in", "/etc/fstab:/proc/self/mountinfo", "--verbose", "--dry-run"],
          reason: "Re-run the safe TRIM probe and keep the operation non-destructive.",
        },
      ],
      filesTouched: ["systemd timer enablement state for fstrim.timer"],
      backupPath: "$STATE_DIR/backups/<timestamp>-enable-weekly-fstrim/fstrim.timer.before.json",
      verification: ["systemctl is-enabled fstrim.timer", "systemctl is-active fstrim.timer", "fstrim --dry-run"],
      rollback: ["If the timer was not previously enabled, run systemctl disable --now fstrim.timer."],
    },
  },
  {
    id: "set-root-noatime",
    title: "Review root atime policy",
    summary: "Review /etc/fstab before changing root atime behavior; actual root remounts remain advisory.",
    markdownPath: "remedies/set-root-noatime/remedy.md",
    findingIds: ["root-atime-policy"],
    mode: "advisory",
    risk: "medium",
    advisory: {
      commands: [
        {
          command: "findmnt",
          args: ["/", "--output", "TARGET,FSTYPE,OPTIONS,SOURCE"],
          reason: "Inspect the current root filesystem, source, and mount options.",
        },
        {
          command: "findmnt",
          args: ["--verify", "--tab-file", "/etc/fstab"],
          reason: "Validate fstab syntax before any manual root mount change.",
        },
        {
          command: "mount",
          args: ["-o", "remount", "/"],
          reason: "Apply a reviewed fstab change without rebooting.",
        },
      ],
      filesTouched: ["/etc/fstab"],
      backupPath: "manual backup required before editing /etc/fstab",
      verification: ["findmnt / --output TARGET,FSTYPE,OPTIONS,SOURCE", "findmnt --verify --tab-file /etc/fstab"],
      rollback: ["Restore the previous /etc/fstab entry and remount /, or reboot into a known-good boot profile."],
    },
  },
  {
    id: "limit-journald-disk-usage",
    title: "Limit persistent journald disk usage",
    summary: "Install a bounded journald drop-in and restart only systemd-journald after validation.",
    markdownPath: "remedies/limit-journald-disk-usage/remedy.md",
    findingIds: ["journald-footprint"],
    mode: "executable",
    risk: "low",
    executable: {
      prechecks: [
        "journald disk usage was collected successfully",
        "systemd-analyze is available for scoped config validation",
        "systemctl can restart systemd-journald.service",
      ],
      commands: [
        {
          command: "systemd-analyze",
          args: ["cat-config", "systemd/journald.conf"],
          reason: "Validate the combined journald configuration before reloading service behavior.",
        },
        {
          command: "systemctl",
          args: ["restart", "systemd-journald.service"],
          reason: "Apply only the changed journald configuration.",
        },
        {
          command: "journalctl",
          args: ["--disk-usage"],
          reason: "Verify journald remains readable after the scoped restart.",
        },
      ],
      filesTouched: ["/etc/systemd/journald.conf.d/90-drive-health-limits.conf"],
      backupPath: "$STATE_DIR/backups/<timestamp>-limit-journald-disk-usage/90-drive-health-limits.conf.before",
      verification: ["systemd-analyze cat-config systemd/journald.conf", "journalctl --disk-usage"],
      rollback: [
        "Restore the backed-up drop-in if one existed, or remove the drive-health drop-in if it was newly created.",
        "Restart systemd-journald.service after restoring the prior file state.",
      ],
    },
  },
  {
    id: "prefer-zram-over-disk-swap",
    title: "Prefer zram over disk-backed swap",
    summary: "Treat swap mode as a workload decision; this first pass reports exact checks but does not change swap.",
    markdownPath: "remedies/prefer-zram-over-disk-swap/remedy.md",
    findingIds: ["swap-mode"],
    mode: "advisory",
    risk: "high",
    advisory: {
      commands: [
        {
          command: "swapon",
          args: ["--show", "--bytes", "--output", "NAME,TYPE,SIZE,USED,PRIO"],
          reason: "List active swap devices and identify disk-backed swap.",
        },
        {
          command: "zramctl",
          args: ["--json", "--output-all", "--bytes"],
          reason: "Inspect active zram devices where supported.",
        },
        {
          command: "apt-cache",
          args: ["policy", "zram-tools"],
          reason: "Check whether Debian zram tooling is available.",
        },
      ],
      filesTouched: ["swap service configuration", "zram package configuration"],
      backupPath: "manual backup required before changing swap or zram configuration",
      verification: ["swapon --show --bytes --output NAME,TYPE,SIZE,USED,PRIO", "zramctl --json --output-all --bytes"],
      rollback: ["Restore the prior swap configuration and reactivate the prior swap device or service."],
    },
  },
  {
    id: "clean-package-cache",
    title: "Clean package manager cache",
    summary: "Use apt's own cache cleanup commands after reviewing cache size and package-manager state.",
    markdownPath: "remedies/clean-package-cache/remedy.md",
    findingIds: [],
    mode: "advisory",
    risk: "low",
    advisory: {
      commands: [
        {
          command: "du",
          args: ["-sb", "/var/cache/apt"],
          reason: "Measure apt cache size before cleanup.",
        },
        {
          command: "apt-get",
          args: ["clean"],
          reason: "Remove downloaded package cache using apt's own cleanup path.",
        },
        {
          command: "apt-get",
          args: ["autoclean"],
          reason: "Remove obsolete downloaded package files using apt's own cleanup path.",
        },
      ],
      filesTouched: ["/var/cache/apt"],
      backupPath: "not applicable; apt cache cleanup is intentionally disposable and remains advisory",
      verification: ["du -sb /var/cache/apt"],
      rollback: ["No direct rollback; packages must be downloaded again when needed."],
    },
  },
  {
    id: "audit-large-log-writers",
    title: "Audit large log writers",
    summary: "Identify chatty services before changing broad logging or persistence policy.",
    markdownPath: "remedies/audit-large-log-writers/remedy.md",
    findingIds: ["journald-footprint"],
    mode: "advisory",
    risk: "low",
    advisory: {
      commands: [
        {
          command: "journalctl",
          args: ["--disk-usage"],
          reason: "Measure journal footprint.",
        },
        {
          command: "du",
          args: ["-xhd1", "/var/log"],
          reason: "Identify large log directories without crossing filesystems.",
        },
        {
          command: "journalctl",
          args: ["--since", "-24h", "--no-pager"],
          reason: "Review recent log volume by service before changing policy.",
        },
      ],
      filesTouched: [],
      backupPath: "not applicable; this remedy is read-only",
      verification: ["Confirm the largest log paths and chatty services before changing retention or storage policy."],
      rollback: ["Not applicable; this remedy is read-only."],
    },
  },
];

export function getRemedy(id: string): RemedyMetadata | undefined {
  return REMEDIES.find((remedy) => remedy.id === id as RemedyId);
}
