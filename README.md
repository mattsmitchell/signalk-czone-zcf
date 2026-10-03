# signalk-czone-zcf

Canonical structural parser for CZone ZCF configuration and status tables used by the Signal K CZone plugins.

This package owns the shared format-level parsing logic so `signalk-czone` and `signalk-czone-circuits` can consume the same parser implementation.

## API

```js
const zcf = require('signalk-czone-zcf')

const parsed = zcf.parse(buffer)
// parsed.circuitTable, parsed.statusTable, parsed.circuits, parsed.modes
// parsed.vesselName, parsed.modules, parsed.moduleAddresses

// File convenience API; it returns the same parsed representation plus
// fileName, filePath and fileSize.
const fromFile = zcf.load('/path/to/installation.zcf')

const table = parsed.circuitTable
const circuits = parsed.circuits
const modes = parsed.modes
const modules = parsed.modules
const moduleAddresses = parsed.moduleAddresses
const vesselName = parsed.vesselName

const statusTable = zcf.parseStatusTable(buffer, table)
const statusByName = zcf.buildStatusMap(statusTable)
const statusByOutput = zcf.buildStatusOutputMap(statusTable)
```

The parser is deliberately structural: table lengths, record counts, record boundaries and field lengths define the data. `parse(buffer)` is the canonical Buffer API; `load(filename)` is its file convenience wrapper. It does not rely on file-wide name searches or fixed byte signatures.

Module declarations and the length-prefixed vessel/configuration name are exposed as structural metadata. `moduleAddresses` contains the non-zero CZone device/dipswitch addresses declared by the configuration, allowing consumers to choose a non-colliding command identity without knowing anything about a particular vessel.

## Scope

This package contains format-level ZCF parsing only. Signal K paths, NMEA 2000 transport, CZone command generation, UI behavior and plugin configuration remain in the consuming plugins.

The real-world ZCF regression corpus remains in the consuming plugin repositories during this initial extraction so existing fixture provenance and field-test coverage are preserved.

## Related repositories

- https://github.com/mattsmitchell/signalk-czone
- https://github.com/mattsmitchell/signalk-czone-circuits
