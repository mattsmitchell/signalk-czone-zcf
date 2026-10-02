'use strict'

const assert = require('assert')
const { parseCircuitTable, parseStatusTable, buildStatusMap, buildStatusOutputMap } = require('../')

function makeCircuitTable () {
  const name = Buffer.from('Test Circuit')
  const output = Buffer.from([2, 0x14, 0xE8, 0x03, 0])
  const record = Buffer.concat([
    Buffer.from([1]),
    (() => { const b=Buffer.alloc(4); b.writeUInt32LE(0); return b })(),
    (() => { const b=Buffer.alloc(2); b.writeUInt16LE(0x20); return b })(),
    Buffer.from([name.length]), name,
    Buffer.from([2,0,0,0,0,0]),
    Buffer.from([11,0,0,0,1,0]), output
  ])
  const h=Buffer.alloc(10); h.writeUInt32LE(6+record.length); h.writeUInt16LE(1); Buffer.from([8,8,5,14]).copy(h,6)
  return Buffer.concat([h,record])
}

function makeStatusTable () {
  const name = Buffer.from('Test Circuit')
  const rec = Buffer.alloc(17 + name.length)
  rec[0]=13; rec[1]=0x14; rec[16]=name.length; name.copy(rec,17)
  const h=Buffer.alloc(7); h.writeUInt32LE(3+rec.length); h.writeUInt16LE(1); h[6]=1
  return Buffer.concat([h,rec])
}

const circuitZcf=makeCircuitTable()
const zcf=Buffer.concat([circuitZcf,makeStatusTable()])
const circuitTable=parseCircuitTable(zcf)
console.log('DEBUG', { circuitTable, statusStart: circuitTable && circuitTable.offset + 4 + circuitTable.tableLength, zcfLength: zcf.length, statusHeader: zcf.subarray(circuitTable.offset + 4 + circuitTable.tableLength, circuitTable.offset + 4 + circuitTable.tableLength + 8).toString('hex') })
const status=parseStatusTable(zcf,circuitTable)
assert(status)
assert.strictEqual(status.recordCount,1)
const byName=buildStatusMap(status)
assert.deepStrictEqual([byName.get('Test Circuit').statusModule,byName.get('Test Circuit').statusBit], [0x14,13])
assert.strictEqual(buildStatusOutputMap(status).get('20:13').name,'Test Circuit')
console.log('CZone status-table parser tests passed')
