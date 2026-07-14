# Low-Write Pi USB Flash Profile

The `pi-usb-flash` profile is for Raspberry Pi agents booting from small USB
flash drives where write reduction matters more than peak throughput.

Use the profile twice:

- before first boot, while preparing the image;
- after boot, to verify the actual kernel, block stack, services, and package
  state.

## Before First Boot

Image-time choices are easier to make before the agent starts accumulating logs
and package cache:

- **Base image:** Raspberry Pi OS Lite is the conservative official baseline.
  It is predictable for Pi firmware, cloud-init, NetworkManager, and Codex
  bootstrap work, but it needs explicit write-reduction choices.
- **DietPi-style image:** DietPi can reduce background writes and offers RAMlog
  tradeoffs earlier, but it diverges from the official Raspberry Pi OS setup
  path. Treat that as an image family decision, not a post-install tweak.
- **Atime policy:** prefer `noatime` for flash-heavy root filesystems when the
  workload does not need access-time updates. `relatime` is acceptable when
  compatibility matters more than maximum write reduction.
- **Journald policy:** choose bounded persistent logs or volatile logs before
  first boot. Volatile logs reduce flash writes but remove reboot history.
- **Swap posture:** prefer zram or zswap over disk-backed swap on low-write
  hosts, with an explicit memory-pressure risk note. Avoid silently enabling a
  large swap file on the USB boot drive.
- **TRIM posture:** periodic `fstrim.timer` is preferred over continuous
  mount-time discard, but actual support must be verified after boot because USB
  bridges and flash devices may not advertise discard.
- **Cache cleanup:** clean apt/package caches after image customization and
  first-boot setup. Do not delete package-manager state ad hoc.

For a mounted root filesystem, the relevant review points are usually:

```text
/etc/fstab
/etc/systemd/journald.conf
/etc/systemd/journald.conf.d/
swap service or zram configuration
/var/cache/apt
/var/log
```

The current CLI does not mutate offline images. Use this checklist in the
boot-drive generator or setup templates, then verify after boot.

## After Boot

Run the read-only profile check:

```bash
drive-health check --profile pi-usb-flash
drive-health suggest --profile pi-usb-flash
```

For routine operation, install the read-only runner after reviewing the unit
files:

```bash
drive-health runner install \
  --scope user \
  --bin /usr/local/bin/drive-health \
  --profile pi-usb-flash
drive-health doctor --runner-scope user
```

The profile check reports a `Pi USB flash low-write profile` finding that rolls
up root atime, fstrim support and schedule, journald footprint, swap/zram
posture, and apt cache size. It is a verification signal, not an unattended
remediation path.

## Tradeoff Notes

Bounded persistent journald keeps enough reboot history for debugging while
limiting flash growth. Volatile journald writes less to disk but can hide
first-boot failures after a reboot unless setup logs are copied elsewhere.

zram can reduce USB writes but consumes RAM and CPU. Keep the decision tied to
the agent workload and memory size.

Package-cache cleanup is low risk when done through apt commands, but it means
packages must be downloaded again later. Prefer cleanup after bootstrap rather
than repeatedly during normal operation.
