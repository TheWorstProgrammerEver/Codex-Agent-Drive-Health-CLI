# Prefer zram Over Disk-Backed Swap

## Rationale

Disk-backed swap can add write pressure to inexpensive USB flash media. zram or
zswap can reduce physical writes by compressing memory before reclaiming pages.

## Compatibility

This is workload-sensitive. Small hosts, memory-heavy services, and unattended
agents need explicit out-of-memory risk review before disabling disk-backed
swap.

## Risks

Removing or reducing disk swap can make memory exhaustion more abrupt. zram
uses CPU and RAM and should be sized for the host role.

## Exact Commands For Manual Review

- `swapon --show --bytes --output NAME,TYPE,SIZE,USED,PRIO`
- `zramctl --json --output-all --bytes`
- `cat /proc/sys/vm/swappiness`
- `apt-cache policy zram-tools`

## Files Or State Touched

- advisory only in this first pass
- a future executable version may touch swap service configuration or zram
  package configuration

## Backup

Not automated in this first pass. Future executable work must back up any swap
or zram config files before writing.

## Verification

Confirm the active swap devices, zram state, and swappiness after any manual
change.

## Rollback

Restore the prior swap configuration and reactivate the prior swap device or
service.
