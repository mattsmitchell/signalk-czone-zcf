'use strict'

const assert = require('assert')
const { parseMeters } = require('../lib/zcf-meters')

function settingsTable (recordSize, rows) {
  const table = Buffer.alloc(7 + recordSize * rows.length)
  table.writeUInt32LE(3 + recordSize * rows.length, 0)
  table.writeUInt16LE(rows.length, 4)
  table[6] = recordSize

  rows.forEach((row, i) => {
    const p = 7 + i * recordSize
    table[p] = row.instance
    table[p + 1] = row.meterId
    table[p + 2] = row.module
    if (row.dcTypeRaw !== undefined) table[p + 28] = row.dcTypeRaw
  })

  return table
}

function metersTable (meters) {
  const records = meters.map(m => {
    const name = Buffer.from(m.name, 'utf8')
    return Buffer.concat([
      Buffer.from([m.ac ? 1 : 0, m.meterId, m.module, name.length]),
      name
    ])
  })
  const table = Buffer.alloc(7 + records.reduce((n, r) => n + r.length, 0))
  table.writeUInt32LE(3 + records.reduce((n, r) => n + r.length, 0), 0)
  table.writeUInt16LE(meters.length, 4)
  table[6] = 0x01
  Buffer.concat(records).copy(table, 7)
  return table
}

const meters = metersTable([
  { name: 'House Battery', meterId: 1, module: 0 },
  { name: 'Solar', meterId: 2, module: 0 },
  { name: 'Shore Power', meterId: 1, module: 4, ac: true }
])

const dc = settingsTable(86, [
  { instance: 0, meterId: 1, module: 0, dcTypeRaw: 0x10 },
  { instance: 1, meterId: 2, module: 0, dcTypeRaw: 0x13 }
])

const ac = settingsTable(65, [
  { instance: 2, meterId: 1, module: 4 }
])

const parsed = parseMeters(Buffer.concat([meters, dc, ac]))

assert(parsed)
assert.strictEqual(parsed.count, 3)
assert.deepStrictEqual(
  parsed.meters.map(m => [m.name, m.type, m.meterId, m.module, m.instance]),
  [
    ['House Battery', 'DC', 1, 0, 0],
    ['Solar', 'DC', 2, 0, 1],
    ['Shore Power', 'AC', 1, 4, 2]
  ]
)

assert.deepStrictEqual(
  parsed.meters.filter(m => m.type === 'DC').map(m => [m.name, m.dcType, m.nominalVoltage, m.dcTypeRaw]),
  [
    ['House Battery', 'battery', 12, 0x10],
    ['Solar', 'solar', 12, 0x13]
  ]
)

assert.strictEqual(parsed.meters[0].instanceFrom, 'settings')
assert.strictEqual(parsed.meters[1].instanceFrom, 'settings')
assert.strictEqual(parsed.meters[2].instanceFrom, 'settings')
assert.strictEqual(parsed.meters[0].virtual, true)
assert.strictEqual(parsed.meters[2].virtual, false)

const fs = require('fs')
const path = require('path')

const fixture = name => path.join(__dirname, 'fixtures', name)
const readFixture = name => parseMeters(fs.readFileSync(fixture(name)))

for (const name of [
  'Compass-Rose-28.06.26.zcf',
  'Meitaki-07.04.25.zcf',
  'Persevere-14.07.25.zcf',
  'Sel-Citron-02.04.25.zcf',
  'SugarShack-20260927-01.zcf',
  'TestBench.zcf'
]) {
  assert(readFixture(name), `meters parsed: ${name}`)
}

{
  const cr = Object.fromEntries(readFixture('Compass-Rose-28.06.26.zcf').meters.map(m => [m.name, m]))
  assert.deepStrictEqual(
    [cr['House Battery'].instance, cr['House Battery'].dcType, cr['House Battery'].nominalVoltage],
    [0, 'battery', 12]
  )
  assert.deepStrictEqual(
    [cr.Solar.instance, cr.Solar.dcType, cr.Solar.nominalVoltage],
    [1, 'solar', 12]
  )
}

{
  const ss = Object.fromEntries(readFixture('SugarShack-20260927-01.zcf').meters.map(m => [m.name, m]))
  for (const name of ['Solar Port', 'Solar Stbd', 'Solar Arch Port', 'Solar Arch Stbd']) {
    assert.strictEqual(ss[name].dcType, 'solar', name)
  }
  for (const name of ['Port Alternator', 'Stbd Alternator', 'Port Alt Current', 'Stbd Alt Current']) {
    assert.strictEqual(ss[name].dcType, 'alternator', name)
  }
}

{
  const mei = Object.fromEntries(readFixture('Meitaki-07.04.25.zcf').meters.map(m => [m.name, m]))
  assert.strictEqual(mei['Bow Thruster Battery 24V'].nominalVoltage, 24)
}

{
  const sel = Object.fromEntries(readFixture('Sel-Citron-02.04.25.zcf').meters.map(m => [m.name, m]))
  assert.strictEqual(sel['12V DC'].dcType, 'converter')
}

{
  const bench = Object.fromEntries(readFixture('TestBench.zcf').meters.map(m => [m.name, m]))
  assert.strictEqual(bench['5V System - MI'].dcType, 'converter')
}

console.log('ZCF meter parser tests passed')
