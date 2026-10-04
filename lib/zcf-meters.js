'use strict'

/*
 * Structural parser for the CZone ZCF Meters table and its DC/AC settings
 * tables.
 *
 * Meters table:
 *   u32 tableLength | u16 count | u8 header
 *   record: u8 ac | u8 meterId | u8 module | u8 nameLength | name
 *
 * The meterId in the Meters table is a CZone meter identifier. It is NOT the
 * NMEA 2000 instance. The instance is stored in the corresponding DC/AC
 * settings record immediately after the Meters table.
 *
 * DC settings records are 86 bytes in older ZCFs and 92 bytes in newer ZCFs.
 * AC settings records are 65 bytes. Each starts:
 *   u8 nmeaInstance | u8 meterId | u8 module | ...
 *
 * DC settings byte 28 is the CZone DC type:
 *   low nibble  0 battery, 1 alternator, 2 converter, 3 solar cell
 *   high nibble nominal voltage: 1 = 12 V, 2 = 24 V
 *
 * Unknown bytes remain represented by the raw type byte rather than being
 * guessed.
 */

const DC_TYPES = Object.freeze({
  0: 'battery',
  1: 'alternator',
  2: 'converter',
  3: 'solar'
})

const DC_NOMINAL_VOLTAGES = Object.freeze({
  1: 12,
  2: 24
})

function printableName (buf) {
  if (!buf.length) return false
  let letters = 0
  for (const c of buf) {
    if (c < 0x20 || c === 0x7f) return false
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) letters++
  }
  return letters >= 2
}

function tableHeader (buf, offset) {
  if (offset + 7 > buf.length) return null

  const length = buf.readUInt32LE(offset)
  const count = buf.readUInt16LE(offset + 4)
  const end = offset + 4 + length

  if (count < 1 || end > buf.length) return null

  return {
    length,
    count,
    end,
    header: buf[offset + 6]
  }
}

function readSettingsTable (buf, offset, expectedRecordSize) {
  if (offset + 7 > buf.length) return null

  const length = buf.readUInt32LE(offset)
  const count = buf.readUInt16LE(offset + 4)
  const recordSize = buf[offset + 6]

  if (count === 0 && length === 3) {
    return { offset, length, count: 0, recordSize, rows: [], end: offset + 7 }
  }

  if (count < 1 || count > 64) return null
  if (recordSize !== expectedRecordSize) return null
  if (length !== 3 + count * recordSize) return null
  if (offset + 4 + length > buf.length) return null

  const rows = []
  for (let i = 0; i < count; i++) {
    const p = offset + 7 + i * recordSize
    const row = {
      offset: p,
      instance: buf[p],
      meterId: buf[p + 1],
      module: buf[p + 2]
    }

    if (expectedRecordSize !== 65) {
      const dcTypeRaw = buf[p + 28]
      const dcType = dcTypeRaw & 0x0f
      const voltageCode = dcTypeRaw >>> 4

      row.dcTypeRaw = dcTypeRaw
      row.dcType = DC_TYPES[dcType] || null
      row.nominalVoltageCode = voltageCode
      row.nominalVoltage = DC_NOMINAL_VOLTAGES[voltageCode] || null
    }

    rows.push(row)
  }

  return {
    offset,
    length,
    count,
    recordSize,
    rows,
    end: offset + 4 + length
  }
}

function applySettings (buf, settingsOffset, meters) {
  const dc = readSettingsTable(buf, settingsOffset, 86)
  const dcNew = readSettingsTable(buf, settingsOffset, 92)
  const dcTable = dcNew || dc

  if (!dcTable) return { dc: null, ac: null }

  const ac = readSettingsTable(buf, dcTable.end, 65)

  for (const meter of meters) {
    const table = meter.type === 'DC' ? dcTable : ac
    if (!table) continue

    const row = table.rows.find(candidate =>
      candidate.meterId === meter.meterId &&
      candidate.module === meter.module
    )
    if (!row) continue

    meter.instance = row.instance
    meter.instanceFrom = 'settings'

    if (meter.type === 'DC') {
      meter.dcTypeRaw = row.dcTypeRaw
      meter.dcType = row.dcType
      meter.nominalVoltageCode = row.nominalVoltageCode
      meter.nominalVoltage = row.nominalVoltage
    }
  }

  return { dc: dcTable, ac }
}

function readMetersAt (buf, offset) {
  const table = tableHeader(buf, offset)
  if (!table || table.count > 64 || table.length < 8 || table.length > 4000) return null

  const meters = []
  let p = offset + 7

  for (let i = 0; i < table.count; i++) {
    if (p + 4 > table.end) return null

    const ac = buf[p]
    const meterId = buf[p + 1]
    const module = buf[p + 2]
    const nameLength = buf[p + 3]

    if (ac > 1 || nameLength < 1 || p + 4 + nameLength > table.end) return null

    const nameBytes = buf.subarray(p + 4, p + 4 + nameLength)
    if (!printableName(nameBytes)) return null

    meters.push({
      name: nameBytes.toString('utf8').trim(),
      type: ac ? 'AC' : 'DC',
      meterId,
      module,
      virtual: module === 0,
      instance: null,
      instanceFrom: null,
      offset: p
    })

    p += 4 + nameLength
  }

  if (p !== table.end) return null

  const settings = applySettings(buf, table.end, meters)

  return {
    offset,
    length: table.length,
    count: table.count,
    header: table.header,
    meters,
    dcSettings: settings.dc,
    acSettings: settings.ac
  }
}

function parseMeters (buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parseMeters expects a Buffer')

  for (let offset = 0; offset + 7 <= buffer.length; offset++) {
    const parsed = readMetersAt(buffer, offset)
    if (parsed) return parsed
  }

  return null
}

module.exports = {
  parseMeters,
  readMetersAt,
  readSettingsTable,
  DC_TYPES,
  DC_NOMINAL_VOLTAGES
}
