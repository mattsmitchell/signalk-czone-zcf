'use strict'

const assert = require('assert')
const { parseCircuitTable, parseStatusTable, buildStatusMap, buildStatusOutputMap } = require('../')

function makeCircuitTable () {
  function record (id, flags, category, name, outputModule, outputChannel) {
    const nameBuf = Buffer.from(name, 'utf8')
    const controls = Buffer.from([2, 0, 0, 0, 0, 0])
    const outputs = Buffer.from([outputChannel, outputModule, 0xE8, 0x03, 0])
    return Buffer.concat([
      Buffer.from([id]),
      (() => { const b=Buffer.alloc(4); b.writeUInt32LE(flags); return b })(),
      (() => { const b=Buffer.alloc(2); b.writeUInt16LE(category); return b })(),
      Buffer.from([nameBuf.length]), nameBuf,
      (() => { const b=Buffer.alloc(4); b.writeUInt32LE(2); return b })(),
      Buffer.from([0, 0]),
      (() => { const b=Buffer.alloc(4); b.writeUInt32LE(7); return b })(),
      Buffer.from([1, 0]), outputs
    ])
  }
  const recordBody = record(1, 0, 0x20, 'Test Circuit', 0x14, 2)
  const h=Buffer.alloc(10); h.writeUInt32LE(6+recordBody.length); h.writeUInt16LE(1); Buffer.from([8,8,5,14]).copy(h,6)
  return Buffer.concat([h,recordBody])
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
const statusStart=circuitTable.offset + 4 + circuitTable.tableLength
console.log('DEBUG', { circuitTable, statusStart, header: zcf.subarray(statusStart, statusStart + 8).toString('hex'), named: require('../').decodeNamedStatusTable(zcf,statusStart) })
const status=parseStatusTable(zcf,circuitTable)
assert(status)
assert.strictEqual(status.recordCount,1)
const byName=buildStatusMap(status)
assert.deepStrictEqual([byName.get('Test Circuit').statusModule,byName.get('Test Circuit').statusBit], [0x14,13])
assert.strictEqual(buildStatusOutputMap(status).get('20:13').name,'Test Circuit')
console.log('CZone status-table parser tests passed')
