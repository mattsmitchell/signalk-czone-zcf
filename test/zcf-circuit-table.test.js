'use strict'

const assert = require('assert')
const { parseCircuitTable, parseCircuits, parseModes, decodeCategories, attachOwnOutputs } = require('../')

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

const categories = decodeCategories(0xFFFF0000, 0x2FFF)
assert.deepStrictEqual(categories.masterCategories, ['Favorites', 'DC', 'AC'])
assert.deepStrictEqual(categories.subCategories, [
  'House/Habitat', 'Vessel Critical', 'Navigation', 'Electronics',
  '24-Hour Circuits', 'Communications', 'Accessories', 'Indicators and Alarms',
  'Engine Management', 'Fans/Ventilation', 'Lighting', 'Vessel Management',
  'Pumps', 'Propulsion Management', 'Power', 'Refrigeration',
  'Entertainment', 'Climate', 'Appliances', 'Other', 'Bilge Pumps'
])
assert.deepStrictEqual(categories.userSubCategories, [
  'User Definable 1', 'User Definable 2', 'User Definable 3', 'User Definable 4', 'User Definable 5'
])
assert.strictEqual(categories.unknownSubCategoryBits, 0)
assert.strictEqual(categories.unknownCategoryWordBits, 0)
assert.strictEqual(categories.subCategoryBits, 0xFFFF0000)
assert.strictEqual(categories.categoryWord, 0x2FFF)
// Bit 12 is intentionally left unnamed; it must remain visible as unknown metadata.
const unknown = decodeCategories(0, 0x1000)
assert.strictEqual(unknown.unknownCategoryWordBits, 0x1000)

const ownership = attachOwnOutputs([
  { id: 1, outputs: [{ module: 1, channel: 2 }] },
  { id: 2, outputs: [{ module: 1, channel: 2 }, { module: 1, channel: 3 }] },
  { id: 3, outputs: [{ module: 1, channel: 4 }] },
  { id: 4, outputs: [{ module: 1, channel: 4 }] }
])
assert.deepStrictEqual(ownership[0].ownOutputs, [{ module: 1, channel: 2 }])
assert.deepStrictEqual(ownership[1].ownOutputs, [{ module: 1, channel: 3 }])
assert.deepStrictEqual(ownership[2].ownOutputs, [{ module: 1, channel: 4 }])
assert.deepStrictEqual(ownership[3].ownOutputs, [{ module: 1, channel: 4 }])
assert.strictEqual(ownership[0].primaryOutput, ownership[0].outputs[0])

console.log('CZone circuit-table parser tests passed')
