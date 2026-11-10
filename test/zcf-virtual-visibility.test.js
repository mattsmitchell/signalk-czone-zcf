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

// Compare every pre-existing fixture with the visibility formula on main.
// Assert per-circuit values AND aggregate visible/hidden counts; no previously
// visible or hidden circuits should change when this feature is introduced.
// The original fixture tests and their fixed seven-file corpus remain intact.
const fixtures = path.join(__dirname, 'fixtures')
const existingFiles = fs.readdirSync(fixtures).filter(file => file.endsWith('.zcf')).sort()
assert.deepStrictEqual(existingFiles, [
  'Compass-Rose-28.06.26.zcf',
  'Meitaki-07.04.25.zcf',
  'Meitaki-2026-10-15.zcf',
  'Persevere-14.07.25.zcf',
  'Sel-Citron-02.04.25.zcf',
  'SugarShack-20260927-01.zcf',
  'TestBench.zcf'
])

for (const file of existingFiles) {
  const model = parse(fs.readFileSync(path.join(fixtures, file)))
  const baseline = model.circuits.map(c => !c.virtual.virtualOnly && c.display.onDisplay)
  const actual = model.circuits.map(c => c.showInCircuitList)

  assert.deepStrictEqual(
    actual, baseline,
    file + ': circuit visibility differs from main'
  )
  const beforeVisible = baseline.filter(Boolean).length
  const beforeHidden = baseline.length - beforeVisible
  const afterVisible = actual.filter(Boolean).length
  const afterHidden = actual.length - afterVisible
  assert.strictEqual(afterVisible, beforeVisible, file + ': visible count changed')
  assert.strictEqual(afterHidden, beforeHidden, file + ': hidden count changed')
  console.log(file + ': ' + afterVisible + ' visible, ' + afterHidden + ' hidden (unchanged)')
}

// End-to-end binary fixture for single-output virtual switches. The
// filename, circuit names, and vessel identity are NOT part of the classifier.
const novemberFixture = path.join(fixtures, 'virtual', 'Sugar Shack-20261103-04.zcf')
const november = parse(fs.readFileSync(novemberFixture))
const virtualCircuits = november.circuits.filter(c => c.virtual.virtualOnly)
const visibleVirtualCircuits = virtualCircuits.filter(c => c.showInCircuitList)
assert.strictEqual(virtualCircuits.length, 2,
  'November Sugar Shack: expected exactly two virtual-only circuits')
assert.strictEqual(visibleVirtualCircuits.length, 2,
  'November Sugar Shack: both virtual-only circuits should be visible')

assert.deepStrictEqual(
  visibleVirtualCircuits.map(c => [c.zcfCircuitId, c.module, c.channel]).sort((a, b) => a[0] - b[0]),
  [[120, 28, 33], [121, 28, 32]],
  'November Sugar Shack: virtual switch identity and channels'
)
for (const circuit of visibleVirtualCircuits) {
  assert.strictEqual(c.virtual.outputCount, 1,
    'November Sugar Shack: visible virtual switch must have one virtual output')
  assert.strictEqual(c.display.onDisplay, true,
    'November Sugar Shack: visible virtual switch must have a display control')
  assert(c.display.controls.some(control => control.module === 0),
    'November Sugar Shack: expected All Display Interfaces control')
}

// The proposed feature changes only two visibility values in this fixture:
// the complete list gains exactly two entries compared with main's rule.
const oldVisible = november.circuits.filter(c =>
  !c.virtual.virtualOnly && c.display.onDisplay
)
const newlyVisible = november.circuits.filter(c => c.showInCircuitList)
const oldHiddenCount = november.circuits.length - oldVisible.length
const newHiddenCount = november.circuits.length - newlyVisible.length
assert.strictEqual(newlyVisible.length, oldVisible.length + 2,
  'November Sugar Shack: the only new visible circuits must be the two virtual switches')
assert.strictEqual(newHiddenCount, oldHiddenCount - 2,
  'November Sugar Shack: the hidden count must decrease by exactly two')
for (const circuit of november.circuits) {
  if (!circuit.virtual.virtualOnly) {
    assert.strictEqual(circuit.showInCircuitList, circuit.display.onDisplay,
      'November Sugar Shack: physical circuit visibility changed: ' + circuit.zcfCircuitId)
  }
}
console.log('November Sugar Shack: ' + newlyVisible.length +
  ' visible / ' + newHiddenCount + ' hidden; baseline ' +
  oldVisible.length + ' visible / ' + oldHiddenCount + ' hidden')
console.log('Virtual circuit visibility and backward-compatibility regression tests passed')
