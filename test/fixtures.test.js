'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { parse, parseCircuitTable } = require('../')

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
    assert(bilge.subCategories.includes('Alarms'), 'Sel-Citron: expected Alarms sub-category')
    assert.strictEqual(bilge.unknownSubCategoryBits & 0x00800000, 0)
  }
}

console.log('Canonical ZCF fixture corpus and module address tests passed')
