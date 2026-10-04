# signalk-czone-zcf

Canonical parser and data model for CZone ZCF configuration and status tables used by Signal K CZone and other CZone consumers.

This package owns the shared ZCF format knowledge. Consumers should use the parsed model rather than reconstructing CZone relationships from raw bytes.

## API

```js
const zcf = require('signalk-czone-zcf')

const parsed = zcf.parse(buffer)
// parsed.circuitTable, parsed.statusTable
// parsed.circuits, parsed.structuralCircuits, parsed.modes
// parsed.statusByName, parsed.statusByOutput
// parsed.vesselName, parsed.modules, parsed.moduleAddresses

const fromFile = zcf.load('/path/to/installation.zcf')
// same model plus fileName, filePath and fileSize
```

The parser is deliberately structural: table lengths, record counts, record boundaries and field lengths define the data. `parse(buffer)` is the canonical Buffer API; `load(filename)` is its file convenience wrapper.

### Canonical circuit model

`parsed.circuits` is the consumer-facing CZone circuit model. It includes the structural circuit data plus the primary output's:

- module address
- channel
- page and slot
- status module, bit, mask and mapping confidence/source
- primary output

The status relationship, including the primary module/channel fallback used when no usable status-table row exists, is part of the ZCF model. Consumers should not duplicate that logic.

The structural records remain available as `parsed.structuralCircuits` when a consumer needs the exact table representation.

Module declarations and the length-prefixed vessel/configuration name are exposed as structural metadata. `moduleAddresses` contains the non-zero CZone device/dipswitch addresses declared by the configuration.

## Scope

This package contains ZCF format and CZone domain-model knowledge. Signal K paths, NMEA 2000 transport, live state publication, command generation, UI behavior and plugin configuration remain in consuming projects.

The canonical regression corpus in `test/fixtures` is part of this package. Each fixture is parsed from bytes by the tests so file loading and the resulting model remain regression-tested as the ZCF format is decoded further.

## Related repositories

- https://github.com/mattsmitchell/signalk-czone
- https://github.com/mattsmitchell/signalk-czone-circuits
