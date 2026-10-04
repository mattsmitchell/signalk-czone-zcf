'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { parse, parseCircuitTable, buildCircuitModel } = require('../')

const expected = ['Compass-Rose-28.06.26.zcf', 'Meitaki-07.04.25.zcf', 'Persevere-14.07.25.zcf', 'Sel-Citron-02.04.25.zcf', 'SugarShack-20260927-01.zcf', 'TestBench.zcf']
const dir = path.join(__dirname, 'fixtures')

assert.deepStrictEqual(fs.readdirSync(dir).filter(f => f.endsWith('.zcf')).sort(), expected)

for (const file of expected) {
  const buffer = fs.readFileSync(path.join(dir, file))
  const table = parseCircuitTable(buffer)
  assert(table, file)
  assert.strictEqual(table.records.length, table.recordCount)

  const parsed = parse(buffer)
  assert.strictEqual(typeof parsed.vesselName, 'string', file)
  assert(parsed.vesselName.length > 0, file + ': expected vessel/configuration name')
  assert(Array.isArray(parsed.modules), file)
  assert(Array.isArray(parsed.moduleAddresses), file)
  assert.strictEqual(parsed.moduleAddresses.length, parsed.modules.length, file)
  assert(parsed.moduleAddresses.length > 0, file + ': expected module addresses')

  assert(Array.isArray(parsed.circuits), file)
  assert.strictEqual(parsed.circuits.length, parsed.circuitTable.records.filter(r => r.kind === 'circuit').length, file)
  assert(parsed.circuits.every(c =>
    (c.module === null && c.channel === null) ||
    (Number.isInteger(c.module) && Number.isInteger(c.channel))
  ), file + ': primary module/channel model')
  assert(parsed.circuits.every(c =>
    (c.page === null && c.slot === null) ||
    (Number.isInteger(c.page) && Number.isInteger(c.slot))
  ), file + ': page/slot model')

  const used = new Set(parsed.moduleAddresses)
  const available = Array.from({ length: 0xFE }, (_, index) => index + 1).filter(id => !used.has(id))
  const commandDeviceId = available[0]
  assert(commandDeviceId, file + ': no unused CZone command device ID')
  assert(!used.has(commandDeviceId), file + ': command device ID collides with module table')
  assert.strictEqual(commandDeviceId, Math.min(...available), file)

  if (file === 'Sel-Citron-02.04.25.zcf') {
    const bilge = parsed.circuits.find(c => c.name === 'Bilge Buzzer - Port')
    assert(bilge, 'Sel-Citron: expected Bilge Buzzer - Port')
    assert((bilge.flags & 0x00800000) !== 0, 'Sel-Citron: expected Alarms sub-category bit')
    assert(bilge.subCategories.includes('Indicators and Alarms'), 'Sel-Citron: expected Alarms sub-category')
    assert.strictEqual(bilge.unknownSubCategoryBits & 0x00800000, 0)
  }
}

const testBench = parse(fs.readFileSync(path.join(dir, 'TestBench.zcf')))
assert(testBench.circuits.every(c => c.statusModule != null && c.statusBit != null && c.statusMask != null), 'TestBench: status mappings must attach')
const sugar = parse(fs.readFileSync(path.join(dir, 'SugarShack-20260927-01.zcf')))
const sugarGalley = sugar.circuits.find(c => c.name === 'Galley Lights')
assert(sugarGalley, 'Sugar Shack: Galley Lights fixture circuit')
assert(sugarGalley.statusModule != null && sugarGalley.statusBit != null && sugarGalley.statusMask != null, 'Sugar Shack: Galley Lights status mapping')

const synthetic = [{
  id: 1,
  name: 'Fallback Circuit',
  flags: 0,
  category: 0x20,
  kind: 'circuit',
  hidden: false,
  outputs: [{ module: 7, channel: 3, levelRaw: 1000, levelPercent: 100, extended: false, rawHex: '0703e80300' }]
}]
const fallback = buildCircuitModel(synthetic, new Map(), new Map(), { format: 'synthetic' })[0]
assert.strictEqual(fallback.statusModule, 7)
assert.strictEqual(fallback.statusBit, 3)
assert.strictEqual(fallback.statusMask, 0x08)
assert.strictEqual(fallback.statusConfidence, 'primary-module-channel-fallback')
assert.strictEqual(fallback.status.source, 'primary-module-channel')
assert.strictEqual(fallback.page, 0)
assert.strictEqual(fallback.slot, 3)

console.log('Canonical ZCF fixture corpus, circuit model, and status mapping tests passed')
