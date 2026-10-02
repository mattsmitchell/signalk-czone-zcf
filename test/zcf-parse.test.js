'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const zcf = require('../')

const name = Buffer.from('Test Circuit')
const outputs = Buffer.from([2, 1, 0xE8, 0x03, 0])
const record = Buffer.concat([
  Buffer.from([1]),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from([0x20, 0]),
  Buffer.from([name.length]),
  name,
  Buffer.from([2, 0, 0, 0, 0, 0]),
  Buffer.from([7, 0, 0, 0, 1, 0]),
  outputs
])
const header = Buffer.alloc(10)
header.writeUInt32LE(6 + record.length, 0)
header.writeUInt16LE(1, 4)
Buffer.from([8, 8, 5, 14]).copy(header, 6)
const buffer = Buffer.concat([header, record])

const parsed = zcf.parse(buffer)
assert.strictEqual(parsed.circuits.length, 1)
assert.strictEqual(parsed.circuits[0].name, 'Test Circuit')
assert.strictEqual(parsed.modes.length, 0)
assert(parsed.circuitTable)
assert.strictEqual(parsed.statusTable, null)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-czone-zcf-'))
const file = path.join(dir, 'test.zcf')
fs.writeFileSync(file, buffer)
const loaded = zcf.load(file)
assert.strictEqual(loaded.fileName, 'test.zcf')
assert.strictEqual(loaded.fileSize, buffer.length)
assert.strictEqual(loaded.circuits.length, 1)
assert.strictEqual(loaded.circuits[0].name, 'Test Circuit')

fs.rmSync(dir, { recursive: true, force: true })
console.log('CZone ZCF parse/load API tests passed')
