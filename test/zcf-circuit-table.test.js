'use strict'

const assert = require('assert')
const { parseCircuitTable, parseCircuits, parseModes, decodeCategories } = require('../')

function record (id, flags, category, name, outputModule, outputChannel) {
  const nameBuf = Buffer.from(name, 'utf8')
  const controls = Buffer.from([2, 0, 0, 0, 0, 0])
  const outputs = Buffer.from([outputChannel, outputModule, 0xE8, 0x03, 0])
  const body = Buffer.concat([
    Buffer.from([id]),
    (() => { const b=Buffer.alloc(4); b.writeUInt32LE(flags); return b })(),
    (() => { const b=Buffer.alloc(2); b.writeUInt16LE(category); return b })(),
    Buffer.from([nameBuf.length]), nameBuf,
    (() => { const b=Buffer.alloc(4); b.writeUInt32LE(2); return b })(),
    Buffer.from([0, 0]),
    (() => { const b=Buffer.alloc(4); b.writeUInt32LE(7); return b })(),
    Buffer.from([1, 0]), outputs
  ])
  return body
}

const circuit = record(1, 0, 0x20, 'Test Circuit', 1, 2)
const mode = record(2, 0, 0, 'Test Mode', 1, 3)
const payload = Buffer.concat([circuit, mode])
const header = Buffer.alloc(10)
header.writeUInt32LE(6 + payload.length, 0)
header.writeUInt16LE(2, 4)
Buffer.from([8, 8, 5, 14]).copy(header, 6)
const zcf = Buffer.concat([header, payload])

const table = parseCircuitTable(zcf)
assert(table)
assert.strictEqual(table.recordCount, 2)
assert.strictEqual(parseCircuits(zcf).length, 1)
assert.strictEqual(parseModes(zcf).length, 1)
assert.strictEqual(parseCircuits(zcf)[0].name, 'Test Circuit')
assert.strictEqual(parseModes(zcf)[0].name, 'Test Mode')

const categories = decodeCategories(0x46840000, 0x71)
assert.deepStrictEqual(categories.masterCategories, ['Favorites', 'DC', 'AC'])
assert.deepStrictEqual(categories.subCategories, ['Lighting', 'Navigation', 'Pumps', 'Power', 'Entertainment'])
assert.strictEqual(categories.unknownSubCategoryBits, 0)
assert.strictEqual(categories.unknownCategoryWordBits, 0)
assert.strictEqual(categories.subCategoryBits, 0x46840000)
assert.strictEqual(categories.categoryWord, 0x71)
console.log('CZone circuit-table parser tests passed')
