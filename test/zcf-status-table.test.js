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
  const h=Buffer.alloc(10); h.writeUInt32LE(6+payload.length); h.writeUInt16LE(2, 4); Buffer.from([8,8,5,14]).copy(h,6)
  return Buffer.concat([h,payload])
}

function makeStatusTable () {
  const name = Buffer.from('Test Circuit')
  const rec = Buffer.alloc(17 + name.length)
  rec[0]=13; rec[1]=0x14; rec[16]=name.length; name.copy(rec,17)
  const h=Buffer.alloc(7); h.writeUInt32LE(3+rec.length); h.writeUInt16LE(1, 4); h[6]=1
  return Buffer.concat([h,rec])
}

const circuitZcf=makeCircuitTable()
const zcf=Buffer.concat([circuitZcf,makeStatusTable()])
const circuitTable = { offset: 0, tableLength: circuitZcf.length - 4 }
const status=parseStatusTable(zcf,circuitTable)
assert(status)
assert.strictEqual(status.recordCount,1)
const byName=buildStatusMap(status)
assert.deepStrictEqual([byName.get('Test Circuit').statusModule,byName.get('Test Circuit').statusBit], [0x14,13])
assert.strictEqual(buildStatusOutputMap(status).get('20:13').name,'Test Circuit')

// The same records with the 18-byte header a newer Configuration Tool
// writes (one more byte before the name length): Meitaki's April 2025 and
// October 2026 files.
{
  const fs = require('fs')
  const path = require('path')
  const read = name => fs.readFileSync(path.join(__dirname, 'fixtures', name))
  const pick = buf => {
    const st = parseStatusTable(buf, parseCircuitTable(buf))
    const alarm = buildStatusMap(st)
    return [st.records.length, st.records[0].rawHeaderHex.length / 2, st.records.find(r => r.name === 'Audible Alarm').statusModule, st.records.find(r => r.name === 'Audible Alarm').statusBit, alarm.size > 0]
  }
  assert.deepStrictEqual(pick(read('Meitaki-07.04.25.zcf')), [139, 17, 0x12, 4, true])
  assert.deepStrictEqual(pick(read('Meitaki-2026-10-15.zcf')), [144, 18, 0x12, 4, true])
}
console.log('CZone status-table parser tests passed')
