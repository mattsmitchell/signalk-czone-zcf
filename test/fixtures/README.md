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
