# Canonical CZone ZCF regression fixtures

These are the canonical real-world binary fixtures used by the structural parser and by the two consuming CZone plugin repositories.

Keep the corpus byte-for-byte identical when copied elsewhere. Tests should use repository-relative paths; do not depend on local upload paths such as `/mnt/data`.

Current corpus:

- `TestBench.zcf`
- `Compass-Rose-28.06.26.zcf`
- `Persevere-14.07.25.zcf`
- `Sel-Citron-02.04.25.zcf`
- `Meitaki-07.04.25.zcf`
- `Meitaki-2026-10-15.zcf`: the same boat re-saved by a newer Configuration Tool (October 2026). Signal-input records are 6 bytes shorter (no `00 00 00 00 ff ff` before the name) and status-table records 1 byte longer (18-byte header); 123 circuits and 7 modes as listed by its owner's Configuration Tool.
- `SugarShack-20260927-01.zcf`

Controlled variants may be added only with a note documenting the exact byte-level change and its purpose.

## Virtual-switch visibility fixture

- `virtual/Sugar Shack-20261103-04.zcf`: unmodified 15,491-byte ZCF supplied
  for visibility regression on November 10, 2026 (SHA-256:
  `b6e7255c71bf5a928651ad011bd01d1512a0cab2febb7da38b590bca9bfed29c`).
  This configuration contains two virtual-only, single-output circuits with
  explicit All Display Interfaces controls (IDs 120 and 121, module 28 channels
  33 and 32). The proposed visibility rule should expose exactly these two,
  while preserving all other circuit visibility. The nested fixture keeps the
  original seven-file root corpus unchanged, including the exact-file-list
  assertion in `test/fixtures.test.js`. No vessel or circuit name is used
  in the parser's visibility decision.
