'use strict'

// Structural parser for the CZone ZCF circuit table.
//
// Unlike signature scanning (e.g. requiring E8 03 at a fixed offset), this
// walks the table using its own length and count fields, so every circuit is
// read regardless of type, and a mis-parse cannot silently drop records.
//
// Table layout (little-endian):
//
//   u32  tableLength        bytes after this field, up to the end of the table
//   u16  recordCount
//   u8[4] tableHeader       (observed 08 08 05 0E / 08 08 05 0F ...)
//   record[recordCount]
//
// Record layout:
//
//   u8   circuitId          runtime ID used in 27 99 <id> ... commands
//   u32  flags              bitfield containing canonical sub-category bits;
//                           0x0400 also marks a logic block ("LB ...")
//   u16  category           master-category/Entertainment bitmask:
//                           0x0010 Favorites, 0x0020 DC, 0x0040 AC,
//                           0x0001 Entertainment; 0x0000 for Modes
//   u8   nameLength
//   u8[] name               UTF-8 (degree signs appear as E2 81 B0)
//   u32  controlsLength     bytes after this field
//   u16  controlCount
//   u8[] controls           variable-size entries, skipped by length
//   u32  outputsLength      bytes after this field
//   u16  outputCount
//   output[outputCount]:
//     u8   channel          0-based output channel on the module
//                           (CXP: A.1-A.4 = 0-3, B.1-B.10 = 4-13, C.1-C.6 = 14-19,
//                            VS 01-10 = 0x20-0x29)
//     u8   module           module dipswitch address
//     u16  level            tenths of a percent (0x03E8 = 100.0%); bit 0x0400
//                           marks an extended 14-byte entry
//     u8   reserved
//     u8[9] extended        present only when (level & 0x0400)
//
// Validated against the circuit and load lists shown by the CZone
// Configuration Tool for TestBench and Compass Rose (exact names, count,
// channel and module), live-tested circuit IDs on TestBench, and an exact
// table walk (count and byte length) on six production ZCFs.

function u16 (buf, p) { return buf.readUInt16LE(p) }
function u32 (buf, p) { return buf.readUInt32LE(p) }


const ZONE_MASTER_CATEGORY_BITS = Object.freeze({
  Favorites: 0x10,
  DC: 0x20,
  AC: 0x40
})

const ZONE_FLAG_SUB_CATEGORY_BITS = Object.freeze({
  'House/Habitat': 0x00010000,
  'Vessel Critical': 0x00020000,
  Navigation: 0x00040000,
  Electronics: 0x00080000,
  '24-Hour Circuits': 0x00100000,
  Communications: 0x00200000,
  Accessories: 0x00400000,
  'Indicators and Alarms': 0x00800000,
  'Engine Management': 0x01000000,
  'Fans/Ventilation': 0x02000000,
  Lighting: 0x04000000,
  'Vessel Management': 0x08000000,
  Pumps: 0x10000000,
  'Propulsion Management': 0x20000000,
  Power: 0x40000000,
  Refrigeration: 0x80000000
})

const ZONE_WORD_SUB_CATEGORY_BITS = Object.freeze({
  Entertainment: 0x0001,
  Climate: 0x0002,
  Appliances: 0x0004,
  Other: 0x0008,
  Favorites: 0x0010,
  DC: 0x0020,
  AC: 0x0040,
  'User Definable 1': 0x0080,
  'User Definable 2': 0x0100,
  'User Definable 3': 0x0200,
  'User Definable 4': 0x0400,
  'User Definable 5': 0x0800,
  'Bilge Pumps': 0x2000
})

const ZONE_SUB_CATEGORY_BITS = Object.freeze({
  ...ZONE_FLAG_SUB_CATEGORY_BITS,
  ...ZONE_WORD_SUB_CATEGORY_BITS
})

const KNOWN_FLAG_SUB_CATEGORY_BITS = Object.values(ZONE_FLAG_SUB_CATEGORY_BITS)
  .reduce((mask, bit) => mask | bit, 0) >>> 0

const KNOWN_WORD_SUB_CATEGORY_BITS = Object.values(ZONE_WORD_SUB_CATEGORY_BITS)
  .reduce((mask, bit) => mask | bit, 0) >>> 0

const KNOWN_CATEGORY_BITS = (Object.values(ZONE_MASTER_CATEGORY_BITS)
  .reduce((mask, bit) => mask | bit, 0) |
  KNOWN_WORD_SUB_CATEGORY_BITS) >>> 0

function decodeCategories (flags, category) {
  const subCategoryBits = flags >>> 0
  const categoryWord = category >>> 0

  const masterCategories = Object.entries(ZONE_MASTER_CATEGORY_BITS)
    .filter(([, bit]) => (categoryWord & bit) !== 0)
    .map(([name]) => name)

  const subCategories = [
    ...Object.entries(ZONE_FLAG_SUB_CATEGORY_BITS)
      .filter(([, bit]) => (subCategoryBits & bit) !== 0)
      .map(([name]) => name),
    ...Object.entries(ZONE_WORD_SUB_CATEGORY_BITS)
      .filter(([name, bit]) =>
        name !== 'Favorites' && name !== 'DC' && name !== 'AC' &&
        !name.startsWith('User Definable') &&
        (categoryWord & bit) !== 0
      )
      .map(([name]) => name)
  ]

  const userSubCategories = Object.entries(ZONE_WORD_SUB_CATEGORY_BITS)
    .filter(([name, bit]) => name.startsWith('User Definable') && (categoryWord & bit) !== 0)
    .map(([name]) => name)

  return {
    masterCategories,
    subCategories,
    userSubCategories,
    unknownSubCategoryBits: (subCategoryBits & ~KNOWN_FLAG_SUB_CATEGORY_BITS) >>> 0,
    unknownCategoryWordBits: (categoryWord & ~KNOWN_CATEGORY_BITS) >>> 0,
    subCategoryBits,
    categoryWord
  }
}

function decodeOutputs (buf, start, end, count) {
  const outputs = []
  let p = start
  for (let i = 0; i < count; i++) {
    if (p + 5 > end) return null
    const raw = u16(buf, p + 2)
    const extended = (raw & 0x0400) !== 0
    const size = extended ? 14 : 5
    if (p + size > end) return null
    const level = raw & ~0x0400
    outputs.push({
      channel: buf[p],
      module: buf[p + 1],
      levelRaw: level,
      levelPercent: level / 10,
      extended,
      rawHex: buf.subarray(p, p + size).toString('hex')
    })
    p += size
  }
  return p === end ? outputs : null
}

function decodeControls (controlsRaw, controlCount) {
  const controls = []
  let p = 0
  for (let i = 0; i < controlCount; i++) {
    if (p + 7 > controlsRaw.length) return { controls: [], trailingHex: controlsRaw.toString('hex') }
    const input = controlsRaw[p]
    const module = controlsRaw[p + 1]
    const byte2 = controlsRaw[p + 2]
    const controlType = controlsRaw[p + 3]
    const setting = controlsRaw[p + 4]
    const byte5 = controlsRaw[p + 5]
    const descriptionLength = controlsRaw[p + 6]
    p += 7
    if (p + descriptionLength > controlsRaw.length) return { controls: [], trailingHex: controlsRaw.toString('hex') }
    const description = controlsRaw.subarray(p, p + descriptionLength).toString('utf8')
    p += descriptionLength
    // Some older/smaller fixtures include a zero terminator after an empty
    // control description. Preserve it without making it part of the next
    // control entry.
    const remainingControls = controlCount - i - 1
    if (descriptionLength === 0 && p < controlsRaw.length && controlsRaw[p] === 0 &&
      controlsRaw.length - (p + 1) >= remainingControls * 7) p += 1
    controls.push({
      index: i,
      input,
      module,
      controlModule: module === 0 ? 'All Display Interfaces' : null,
      byte2,
      controlType,
      setting,
      byte5,
      descriptionLength,
      description
    })
  }
  return { controls, trailingHex: controlsRaw.subarray(p).toString('hex') }
}

function outputKey (output) {
  return `${output.module}:${output.channel}`
}

// A circuit may include loads that are also listed by another circuit.
// When that other circuit has exactly one output, that output belongs to
// the other circuit for identity/presentation purposes. Outputs shared by
// multi-output circuits remain attached to both circuits.
function attachOwnOutputs (records) {
  const soleOutputOwners = new Map()

  for (const record of records) {
    if (record.outputs.length !== 1) continue
    const key = outputKey(record.outputs[0])
    if (!soleOutputOwners.has(key)) soleOutputOwners.set(key, [])
    soleOutputOwners.get(key).push(record.id)
  }

  return records.map(record => {
    const ownOutputs = record.outputs.filter(output => {
      const owners = soleOutputOwners.get(outputKey(output)) || []
      return owners.length === 0 || (owners.length === 1 && owners[0] === record.id)
    })

    return {
      ...record,
      ownOutputs,
      ownOutputCount: ownOutputs.length,
      primaryOutput: ownOutputs[0] || record.outputs[0] || null
    }
  })
}

function readRecord (buf, p, limit) {
  if (p + 8 > limit) return null
  const id = buf[p]
  const flags = u32(buf, p + 1)
  const category = u16(buf, p + 5)
  const nameLength = buf[p + 7]
  if (nameLength < 1 || p + 8 + nameLength > limit) return null
  const nameBytes = buf.subarray(p + 8, p + 8 + nameLength)
  if (nameBytes.some(c => c < 0x20)) return null
  let q = p + 8 + nameLength

  if (q + 6 > limit) return null
  const controlsLength = u32(buf, q)
  const controlCount = u16(buf, q + 4)
  if (controlsLength < 2 || (controlCount === 0) !== (controlsLength === 2)) return null
  if (q + 4 + controlsLength > limit) return null
  const controlsRaw = buf.subarray(q + 6, q + 4 + controlsLength)
  const decodedControls = decodeControls(controlsRaw, controlCount)
  q += 4 + controlsLength

  if (q + 6 > limit) return null
  const outputsLength = u32(buf, q)
  const outputCount = u16(buf, q + 4)
  if (outputsLength < 2 || (outputCount === 0) !== (outputsLength === 2)) return null
  const outputsEnd = q + 4 + outputsLength
  if (outputsEnd > limit) return null
  const outputs = decodeOutputs(buf, q + 6, outputsEnd, outputCount)
  if (!outputs) return null

  return {
    offset: p,
    end: outputsEnd,
    id,
    name: nameBytes.toString('utf8'),
    flags,
    category,
    ...decodeCategories(flags, category),
    kind: (flags & 0x0400) ? 'logic' : (category === 0 ? 'mode' : 'circuit'),
    hidden: (flags & 0x0400) !== 0 || category === 0,
    controlCount,
    controlsHex: controlsRaw.toString('hex'),
    controls: decodedControls.controls,
    controlsTrailingHex: decodedControls.trailingHex,
    outputs
  }
}

// Try to read the whole table starting at a candidate header offset. Returns
// the records only if exactly recordCount records end exactly at tableLength.
function readTableAt (buf, h) {
  if (h + 10 > buf.length) return null
  const tableLength = u32(buf, h)
  const recordCount = u16(buf, h + 4)
  if (recordCount < 1 || tableLength < 6 || h + 4 + tableLength > buf.length) return null
  const limit = h + 4 + tableLength
  const records = []
  let p = h + 10
  for (let i = 0; i < recordCount; i++) {
    const r = readRecord(buf, p, limit)
    if (!r) return null
    records.push(r)
    p = r.end
  }
  if (p !== limit) return null
  return { offset: h, tableLength, recordCount, headerHex: buf.subarray(h + 6, h + 10).toString('hex'), records }
}

function parseCircuitTable (buf) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('parseCircuitTable expects a Buffer')
  for (let h = 0; h + 10 <= buf.length; h++) {
    const table = readTableAt(buf, h)
    if (table) return table
  }
  return null
}

function requireTable (buf) {
  const table = parseCircuitTable(buf)
  if (!table) throw new Error('CZone circuit table not found in ZCF')
  return table
}

// Circuits as listed (black) in the CZone Configuration Tool.
function parseCircuits (buf) {
  return requireTable(buf).records.filter(r => r.kind === 'circuit')
}

// Modes as listed (blue) in the CZone Configuration Tool. Outputs are the
// Mode's action list; levelPercent 0 = OFF.
function parseModes (buf) {
  return requireTable(buf).records.filter(r => r.kind === 'mode')
}

module.exports = { parseCircuitTable, parseCircuits, parseModes, decodeCategories, attachOwnOutputs, outputKey, ZONE_MASTER_CATEGORY_BITS, ZONE_SUB_CATEGORY_BITS }
