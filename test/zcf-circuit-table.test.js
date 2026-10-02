'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { parseCircuitTable, parseCircuits, parseModes } = require('../')
const fixtures = path.join(__dirname, 'fixtures')
const expected = new Map([
  ['TestBench.zcf', [6, 0]],
  ['Compass-Rose-28.06.26.zcf', [35, 0]],
  ['Persevere-14.07.25.zcf', [58, 0]],
  ['Sel-Citron-02.04.25.zcf', [102, 1]],
  ['Meitaki-07.04.25.zcf', [109, 8]],
  ['SugarShack-20260927-01.zcf', [110, 4]]
])
for (const [file, [circuits, modes]] of expected) {
  const buf = fs.readFileSync(path.join(fixtures, file))
  const table = parseCircuitTable(buf)
  assert(table, file)
  assert.strictEqual(parseCircuits(buf).length, circuits)
  assert.strictEqual(parseModes(buf).length, modes)
  assert.strictEqual(table.records.length, table.recordCount)
}
const testBench = fs.readFileSync(path.join(fixtures, 'TestBench.zcf'))
assert.deepStrictEqual(parseCircuits(testBench).map(c => [c.name, c.outputs[0].module, c.outputs[0].channel]), [
  ['Buzzer', 1, 5], ['Light 1', 1, 0], ['Light 2', 1, 1],
  ['Light 3', 1, 2], ['Light 4', 1, 3], ['Light 5', 1, 5]
])
console.log('CZone circuit-table parser tests passed')
