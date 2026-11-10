'use strict'

const assert = require('assert')
const { buildCircuitModel } = require('../lib/zcf')

function record (overrides = {}) {
  return {
    id: 1,
    name: 'Test Circuit',
    flags: 0,
    category: 0x20,
    masterCategories: ['DC'],
    subCategories: ['Lighting'],
    userSubCategories: [],
    subCategoryBits: 0x04000000,
    categoryWord: 0x20,
    unknownSubCategoryBits: 0,
    unknownCategoryWordBits: 0,
    offset: 100,
    controlsHex: '',
    controlsTrailingHex: '',
    controls: [],
    outputs: [{ module: 1, channel: 2, levelRaw: 1000, levelPercent: 100 }],
    ...overrides
  }
}

const display = buildCircuitModel(
  [record({
    controls: [{
      index: 0, input: 1, module: 0, controlType: 0, setting: 0, byte2: 0, byte5: 0,
      descriptionLength: 0, description: ''
    }]
  })],
  new Map(),
  new Map(),
  null,
  null,
  []
)[0]

assert.strictEqual(display.display.onDisplay, true)
assert.strictEqual(display.display.controlCount, 1)
assert.strictEqual(display.virtual.virtualOnly, false)
assert.strictEqual(display.showInCircuitList, true)

const typedDisplay = buildCircuitModel(
  [record({
    controls: [{
      index: 0, input: 1, module: 16, controlType: 0, setting: 0, byte2: 0, byte5: 0,
      descriptionLength: 0, description: ''
    }]
  })],
  new Map(),
  new Map(),
  null,
  null,
  [{ module: 16, type: 16, name: 'Display Interface' }]
)[0]

assert.strictEqual(typedDisplay.display.onDisplay, true)
assert.strictEqual(typedDisplay.showInCircuitList, true)

const displayControlledVirtual = buildCircuitModel(
  [record({
    name: 'Shower Time',
    id: 120,
    outputs: [{ module: 28, channel: 33, levelRaw: 1000, levelPercent: 100 }],
    controls: [{
      index: 0, input: 0, module: 0, controlType: 1, setting: 1,
      byte2: 0, byte5: 0, descriptionLength: 0, description: ''
    }]
  })],
  new Map(), new Map(), null, null, []
)[0]

assert.strictEqual(displayControlledVirtual.virtual.virtualOnly, true)
assert.strictEqual(displayControlledVirtual.display.onDisplay, true)
assert.strictEqual(displayControlledVirtual.showInCircuitList, true)
assert.strictEqual(displayControlledVirtual.zcfCircuitId, 120)

const displayControlledVirtualWithTypedModule = buildCircuitModel(
  [record({
    name: 'Test VS',
    outputs: [{ module: 2, channel: 41 }],
    controls: [{
      index: 0, input: 1, module: 8, controlType: 1, setting: 1,
      byte2: 0, byte5: 0, descriptionLength: 0, description: ''
    }]
  })],
  new Map(), new Map(), null, null,
  [{ module: 8, type: 16, name: 'Helm Chartplotter' }]
)[0]

assert.strictEqual(displayControlledVirtualWithTypedModule.virtual.virtualOnly, true)
assert.strictEqual(displayControlledVirtualWithTypedModule.showInCircuitList, false)

const refrigerationThermostat = buildCircuitModel(
  [record({
    name: 'Fridge 4⁰C',
    flags: 0x80000000,
    outputs: [{ module: 2, channel: 37 }],
    controls: [{
      index: 0, input: 0, module: 0, controlType: 4, setting: 0,
      byte2: 0, byte5: 0, descriptionLength: 0, description: ''
    }]
  })],
  new Map(), new Map(), null, null, []
)[0]

assert.strictEqual(refrigerationThermostat.virtual.virtualOnly, true)
assert.strictEqual(refrigerationThermostat.display.onDisplay, true)
assert.strictEqual(refrigerationThermostat.showInCircuitList, false)

const nonDisplayControlledVirtual = buildCircuitModel(
  [record({
    outputs: [{ module: 128, channel: 41 }],
    controls: [{
      index: 0, input: 2, module: 24, controlType: 1, setting: 1,
      byte2: 0, byte5: 0, descriptionLength: 0, description: ''
    }]
  })],
  new Map(), new Map(), null, null,
  [{ module: 24, type: 11, name: 'Switch Control Interface 02' }]
)[0]

assert.strictEqual(nonDisplayControlledVirtual.virtual.virtualOnly, true)
assert.strictEqual(nonDisplayControlledVirtual.display.onDisplay, false)
assert.strictEqual(nonDisplayControlledVirtual.showInCircuitList, false)

const hiddenVirtual = buildCircuitModel(
  [record({
    outputs: [{ module: 1, channel: 32, levelRaw: 1000, levelPercent: 100 }]
  })],
  new Map(),
  new Map(),
  null,
  null,
  []
)[0]

assert.strictEqual(hiddenVirtual.virtual.virtualOnly, true)
assert.strictEqual(hiddenVirtual.showInCircuitList, false)

const realWithVirtual = buildCircuitModel(
  [record({
    outputs: [
      { module: 1, channel: 32, levelRaw: 1000, levelPercent: 100 },
      { module: 1, channel: 2, levelRaw: 1000, levelPercent: 100 }
    ],
    controls: [{
      index: 0, input: 1, module: 0, controlType: 0, setting: 0, byte2: 0, byte5: 0,
      descriptionLength: 0, description: ''
    }]
  })],
  new Map(),
  new Map(),
  null,
  null,
  []
)[0]

assert.strictEqual(realWithVirtual.virtual.virtualOnly, false)
assert.strictEqual(realWithVirtual.virtual.outputCount, 1)
assert.strictEqual(realWithVirtual.showInCircuitList, true)

const noControls = buildCircuitModel(
  [record({ controls: [] })],
  new Map(),
  new Map(),
  null,
  null,
  []
)[0]

assert.strictEqual(noControls.display.onDisplay, false)
assert.strictEqual(noControls.showInCircuitList, false)
assert.deepStrictEqual(display.categories.master, ['DC'])

const ownershipModel = buildCircuitModel(
  [{
    ...record({ id: 10, outputs: [{ module: 1, channel: 2 }] }),
    controls: []
  }, {
    ...record({ id: 11, outputs: [{ module: 1, channel: 2 }, { module: 1, channel: 3 }] }),
    controls: []
  }],
  new Map(), new Map(), null, null, []
)
assert.strictEqual(ownershipModel[0].ownOutputCount, 1)
assert.strictEqual(ownershipModel[1].ownOutputCount, 1)
assert.strictEqual(ownershipModel[1].primaryOutput.channel, 3)

console.log('CZone canonical circuit display/virtual model tests passed')
