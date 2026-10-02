# signalk-czone-zcf

Canonical structural parser for CZone ZCF configuration and status tables used by the Signal K CZone plugins.

This package owns the shared format-level parsing logic so `signalk-czone` and `signalk-czone-circuits` can consume the same parser implementation.

## API

```js
const zcf = require('signalk-czone-zcf')

const table = zcf.parseCircuitTable(buffer)
const circuits = zcf.parseCircuits(buffer)
const modes = zcf.parseModes(buffer)

const statusTable = zcf.parseStatusTable(buffer, table)
const statusByName = zcf.buildStatusMap(statusTable)
const statusByOutput = zcf.buildStatusOutputMap(statusTable)
```

The parser is deliberately structural: table lengths, record counts, record boundaries and field lengths define the data. It does not rely on file-wide name searches or fixed byte signatures.

## Scope

This package contains format-level ZCF parsing only. Signal K paths, NMEA 2000 transport, CZone command generation, UI behavior and plugin configuration remain in the consuming plugins.

The real-world ZCF regression corpus remains in the consuming plugin repositories during this initial extraction so existing fixture provenance and field-test coverage are preserved.

## Related repositories

- https://github.com/mattsmitchell/signalk-czone
- https://github.com/mattsmitchell/signalk-czone-circuits
