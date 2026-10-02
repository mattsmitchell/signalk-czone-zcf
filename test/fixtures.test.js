'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { parseCircuitTable } = require('../')
const expected = ['Compass-Rose-28.06.26.zcf','Meitaki-07.04.25.zcf','Persevere-14.07.25.zcf','Sel-Citron-02.04.25.zcf','SugarShack-20260927-01.zcf','TestBench.zcf']
const dir = path.join(__dirname, 'fixtures')
assert.deepStrictEqual(fs.readdirSync(dir).filter(f => f.endsWith('.zcf')).sort(), expected)
for (const file of expected) {
  const table = parseCircuitTable(fs.readFileSync(path.join(dir, file)))
  assert(table, file)
  assert.strictEqual(table.records.length, table.recordCount)
}
console.log('Canonical ZCF fixture corpus tests passed')
