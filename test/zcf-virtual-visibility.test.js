'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { buildCircuitModel, parse } = require('../lib/zcf')

const build = (outputs, controls = [], modules = []) => buildCircuitModel([{
  id: 22,
  name: 'Synthetic Virtual Switch',
  flags: 0,
  category: 0x30,
  masterCategories: ['DC'],
  subCategories: [],
  userSubCategories: [],
  offset: 64,
  controlsHex: '',
  controlsTrailingHex: '',
  controls,
  outputs
}], new Map(), new Map(), null, null, modules)[0]

const output = (module, channel) =>
  ({ module, channel, levelRaw: 1000, levelPercent: 100 })

const allDisplays = (setting = 1, controlType = 1) =>
  ({ input: 0, module: 0, controlType, setting, byte2: 1, byte5: 0, descriptionLength: 0, description: '' })

const moduleControl = (module, input = 16) =>
  ({ input, module, controlType: 4, setting: 1, byte2: 0, byte5: 0, descriptionLength: 0, description: '' })

// User-facing virtual switches: same structure as the two added virtual
// circuits in the November Sugar Shack configuration (no name/ID dependency).
for (const setting of [0, 1]) {
  for (const type of [1, 4]) {
    const circuit = build([output(28, 32)], [allDisplays(setting, type)])
    assert.strictEqual(circuit.virtual.virtualOnly, true)
    assert.strictEqual(circuit.display.onDisplay, true)
    assert.strictEqual(circuit.showInCircuitList, true)
  }
}
const withSecondControl = build(
  [output(28, 33)], [allDisplays(), moduleControl(28, 17)]
)
assert.strictEqual(withSecondControl.showInCircuitList, true)

// Internal setpoint selectors may have a display control but drive several
// virtual outputs. They must not become independent user-facing circuits.
const setpoint = build([
  output(2, 37), output(2, 38), output(2, 39)
], [allDisplays(0, 4)])
assert.strictEqual(setpoint.display.onDisplay, true)
assert.strictEqual(setpoint.virtual.virtualOnly, true)
assert.strictEqual(setpoint.showInCircuitList, false)

// A module-specific control is not proof of All Display Interfaces visibility.
const nonDisplayVirtual = build([output(128, 41)], [moduleControl(24)])
assert.strictEqual(nonDisplayVirtual.showInCircuitList, false)

const chartplotter = build(
  [output(2, 41)], [moduleControl(8)],
  [{ module: 8, type: 16, name: 'Chartplotter' }]
)
assert.strictEqual(chartplotter.display.onDisplay, true)
assert.strictEqual(chartplotter.showInCircuitList, false)
assert.strictEqual(build([output(28, 32)]).showInCircuitList, false)

// Preserve visibility for all circuits with physical outputs.
assert.strictEqual(build([output(1, 2)], [allDisplays()]).showInCircuitList, true)
assert.strictEqual(build([output(1, 2)]).showInCircuitList, false)

// Regression check: no existing fixture's visibility is allowed to change.
// Keep existing unit tests and real-world fixture corpus unmodified.
const fixtures = path.join(__dirname, 'fixtures')
const corpus = fs.readdirSync(fixtures).filter(file => file.endsWith('.zcf'))
assert(corpus.length >= 7, 'expected the existing fixture corpus')

for (const file of corpus) {
  const model = parse(fs.readFileSync(path.join(fixtures, file)))
  for (const circuit of model.circuits) {
    const previouslyVisible = !circuit.virtual.virtualOnly && circuit.display.onDisplay
    assert.strictEqual(
      circuit.showInCircuitList, previouslyVisible,
      file + ': unexpected visibility change for circuit ID ' + circuit.zcfCircuitId
    )
  }
}
console.log('Virtual circuit visibility and backward-compatibility regression tests passed')
