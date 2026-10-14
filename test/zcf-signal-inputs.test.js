'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { parseSignalInputs } = require('../lib/zcf-signal-inputs')

const read = name => fs.readFileSync(path.join(__dirname, 'fixtures', name))

// Every fixture: the table walks exactly, in one of the two layouts, and
// byte 51 of every record is its calibration-point count.
const expected = {
  'Compass-Rose-28.06.26.zcf': ['short', 10],
  'Meitaki-07.04.25.zcf': ['long', 50],
  'Meitaki-2026-10-15.zcf': ['short', 51],
  'Persevere-14.07.25.zcf': ['long', 5],
  'Sel-Citron-02.04.25.zcf': ['long', 34],
  'SugarShack-20260927-01.zcf': ['long', 26],
  'TestBench.zcf': ['short', 6]
}
for (const [file, [layout, count]] of Object.entries(expected)) {
  const buf = read(file)
  const t = parseSignalInputs(buf)
  assert(t, `${file}: signal-input table`)
  assert.deepStrictEqual([t.layout, t.count, t.inputs.length], [layout, count, count], file)
  for (const i of t.inputs) assert.strictEqual(buf[i.offset + 51], i.calibrationCount, `${file}: ${i.name}`)
  assert.strictEqual(t.inputs[t.inputs.length - 1].end, t.offset + 4 + t.length, file)
}

// Compass Rose: switch inputs on a Control X PLUS, with their wiring.
{
  const cr = parseSignalInputs(read('Compass-Rose-28.06.26.zcf'))
  const sw = cr.inputs.filter(i => i.type === 'switch').map(i => [i.name.trim(), i.module, i.input, i.wiring])
  assert.deepStrictEqual(sw, [
    ['BMS Pre-Alarm', 1, 24, 'switchToPos'],
    ['Anchor Up', 2, 17, 'switchToPos'],
    ['High Bilge Water Alarm', 2, 18, 'switchToNeg'],
    ['Ignition', 2, 24, 'switchToPos']
  ])
}

// Meitaki, the same boat in both layouts: the same tank records.
{
  const a = parseSignalInputs(read('Meitaki-07.04.25.zcf')).inputs.filter(i => i.type === 'tank')
  const b = parseSignalInputs(read('Meitaki-2026-10-15.zcf')).inputs.filter(i => i.type === 'tank')
  // The kind byte's top bits differ on the two fuel tanks (0x84 in 2025,
  // 0x04 in 2026); both are tanks (low nibble 4).
  const key = i => [i.name, i.module, i.input, i.kind & 0x0f, i.a, i.b, i.calibrationCount]
  assert.deepStrictEqual(b.map(key), a.map(key))
}

assert.strictEqual(parseSignalInputs(Buffer.alloc(64)), null)

// Through the package and parse().
{
  const pkg = require('../')
  assert.strictEqual(typeof pkg.parseSignalInputs, 'function')
  const parsed = pkg.parse(read('Compass-Rose-28.06.26.zcf'))
  assert.deepStrictEqual([parsed.signalInputs.layout, parsed.signalInputs.count], ['short', 10])
}

console.log('ZCF signal-input table tests passed')
