# Clean Package Manager Cache

## Rationale

Package caches can retain downloaded `.deb` files that are safe to re-download
later. Cleaning through apt avoids ad hoc deletion and keeps package-manager
state consistent.

## Compatibility

Use on Debian or Raspberry Pi OS-style hosts with apt. This first-pass remedy
is advisory because cache cleanup removes local package artifacts and has no
meaningful file backup.

## Risks

Cleaning the cache can make future reinstalls or downgrades require network
access. Do not run while another package manager operation is active.

## Exact Commands For Manual Review

- `du -sb /var/cache/apt`
- `apt-get clean`
- `apt-get autoclean`

## Files Or State Touched

- advisory only in this first pass
- apt cache contents under `/var/cache/apt`

## Backup

No automated backup. The cache is intentionally disposable, but this remedy is
not executable until package-manager lock handling and operator policy are
implemented.

## Verification

Re-run `du -sb /var/cache/apt` and confirm apt commands exit cleanly.

## Rollback

There is no direct rollback for cache deletion; packages must be downloaded
again when needed.
