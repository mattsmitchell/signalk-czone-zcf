'use strict'

const assert = require('assert')
const { parseCircuitTable, parseStatusTable, buildStatusMap, buildStatusOutputMap } = require('../')

function makeCircuitTable () {
  function record (id, flags, category, name, outputModule, outputChannel) {
    const nameBuf = Buffer.from(name, 'utf8')
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
  const circuit = record(1, 0, 0x20, 'Test Circuit', 1, 2)
  const mode = record(2, 0, 0, 'Test Mode', 1, 3)
  const payload = Buffer.concat([circuit, mode])
  const h=Buffer.alloc(10); h.writeUInt32LE(6+payload.length); h.writeUInt16LE(2); Buffer.from([8,8,5,14]).copy(h,6)
  return Buffer.concat([h,payload])
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
const circuitTable = { offset: 0, tableLength: circuitZcf.length - 4 }
const statusStart = circuitTable.offset + 4 + circuitTable.tableLength
console.log('DEBUG', { circuitLen: circuitZcf.length, tableLength: circuitTable.tableLength, statusStart, zcfLen: zcf.length, statusHeader: zcf.subarray(statusStart,statusStart+7).toString('hex'), named: require('../').decodeNamedStatusTable(zcf,statusStart) })
const status=parseStatusTable(zcf,circuitTable)
assert(status)
assert.strictEqual(status.recordCount,1)
const byName=buildStatusMap(status)
assert.deepStrictEqual([byName.get('Test Circuit').statusModule,byName.get('Test Circuit').statusBit], [0x14,13])
assert.strictEqual(buildStatusOutputMap(status).get('20:13').name,'Test Circuit')
console.log('CZone status-table parser tests passed')
