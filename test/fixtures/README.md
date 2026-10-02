# Canonical CZone ZCF regression fixtures

These are the canonical real-world binary fixtures used by the structural parser and by the two consuming CZone plugin repositories.

Keep the corpus byte-for-byte identical when copied elsewhere. Tests should use repository-relative paths; do not depend on local upload paths such as `/mnt/data`.

Current corpus:

- `TestBench.zcf`
- `Compass-Rose-28.06.26.zcf`
- `Persevere-14.07.25.zcf`
- `Sel-Citron-02.04.25.zcf`
- `Meitaki-07.04.25.zcf`
- `SugarShack-20260927-01.zcf`

Controlled variants may be added only with a note documenting the exact byte-level change and its purpose.
