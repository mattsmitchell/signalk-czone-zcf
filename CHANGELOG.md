# Changelog

## 0.1.0-beta.2

- Reads files saved by a newer CZone Configuration Tool (Meitaki, October 2026): status-table records with an 18-byte header, and signal-input records 6 bytes shorter (no `00 00 00 00 ff ff` before the name). Previously such a file gave no status table and no tank monitors.
- New `parseSignalInputs`: the signal-input table (switch inputs, tank and temperature senders, third-party senders) read structurally in both record layouts.
- Tank monitors are now taken from the signal-input table, and each tank's settings (capacity, levels, delays) are read from its own record. They were read from the bytes after its calibration table, which belong to the next input, so a tank showed the next input's settings (Meitaki Fuel Tank Port 275 L instead of 680 L; SugarShack Stbd Water Tank 0 L). Byte 51 is the calibration-point count; `alarmEnable`, `switchEnable` and `severityCodes` are now `null` until bytes 52-53 are confirmed against the Configuration Tool.
- Internal copies (a no-control circuit sharing its name with a circuit that has controls) are marked `kind: 'internal'` and left out of `parseCircuits`. Meitaki: 107 circuits instead of 109, one "Audible Alarm".

## 0.1.0-beta.1

- Initial public beta of the canonical CZone ZCF parser and configuration model.
- Includes structural circuit/status parsing, parse/load APIs, module metadata, and tank-monitor definitions.
- Adds npm repository/support metadata and defaults publication to the beta tag.
