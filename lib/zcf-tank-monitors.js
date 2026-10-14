'use strict'

/*
 * Tank monitors: the tank senders in the signal-input table
 * (zcf-signal-inputs.js), with their calibration tables and settings.
 *
 * Each tank's settings are the bytes at the start of its own record, before
 * its name: 58 bytes in the long record layout (up to the ff ff that precedes
 * the name), 54 in the short layout that newer Configuration Tool files use.
 * The calibration table follows the name: its point count is byte 51 of the
 * record, each point four bytes:
 *
 *   u16 senderValue
 *   u16 levelRaw
 *
 * Earlier versions found tanks by the ff ff before the name and took the 58
 * bytes after the calibration table as the tank's settings. Those bytes are
 * the start of the next input's record, so a tank showed the next input's
 * capacity and levels (Meitaki Fuel Tank Port showed 275 L, Fuel Tank Stbd's;
 * its own is 680 L), and the short layout has no ff ff, so no tanks were found
 * in it at all. If no signal-input table is found, the ff ff scan is still
 * used, for the calibration tables only (no settings).
 *
 * Across the current ZCF fixtures, levelRaw uses a 0..25000 scale, so the
 * decoded percentage is levelRaw / 250. Raw sender values are retained.
 */

const { parseSignalInputs } = require('./zcf-signal-inputs')

const NAME_MARKER = 0xffff
const CONFIGURATION_LENGTH = 58 // long layout; 54 in the short layout
const LEVEL_SCALE = 25000
const MIN_CALIBRATION_POINTS = 2
const MAX_CALIBRATION_POINTS = 33

function printableName (buf) {
  if (!buf.length) return false
  let letters = 0
  for (const c of buf) {
    if (c < 0x20 || c === 0x7f) return false
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) letters++
  }
  return letters >= 2
}

function readNameMarker (buf, offset) {
  if (offset + 3 > buf.length) return null
  if (buf.readUInt16LE(offset) !== NAME_MARKER) return null

  const nameLength = buf[offset + 2]
  const nameOffset = offset + 3
  const end = nameOffset + nameLength

  if (nameLength < 1 || end > buf.length) return null

  const nameBytes = buf.subarray(nameOffset, end)
  if (!printableName(nameBytes)) return null

  return {
    offset,
    nameOffset,
    nameLength,
    nameEnd: end,
    name: nameBytes.toString('utf8')
  }
}

function findNameMarker (buf, start) {
  for (let offset = start; offset + 3 <= buf.length; offset++) {
    const marker = readNameMarker(buf, offset)
    if (marker) return marker
  }
  return null
}

function decodeCalibration (buf, start, length) {
  if (length < MIN_CALIBRATION_POINTS * 4 ||
    length > MAX_CALIBRATION_POINTS * 4 ||
    length % 4 !== 0) return null

  const points = []
  for (let p = start; p < start + length; p += 4) {
    const senderValue = buf.readUInt16LE(p)
    const levelRaw = buf.readUInt16LE(p + 2)

    if (levelRaw > LEVEL_SCALE) return null
    if (points.length && levelRaw < points[points.length - 1].levelRaw) return null

    points.push({
      offset: p,
      senderValue,
      levelRaw,
      levelPercent: levelRaw / 250
    })
  }

  return points
}

/*
 * The 58-byte suffix is a fixed signal-input configuration block shared by
 * tank senders and ordinary signal inputs (switches/other inputs). We are
 * deliberately only identifying its byte-level structure here; field
 * semantics beyond the parts already established from the Configuration Tool
 * are still being reverse-engineered.
 *
 * The important structural fact is that the block is fixed-size while the
 * calibration prefix is variable-size. We therefore parse the record from
 * its name delimiter and validate the calibration prefix, rather than
 * searching for an arbitrary offset or assuming a fixed calibration count.
 */
function readSignalInputConfiguration (buf, offset, length = CONFIGURATION_LENGTH) {
  if (offset < 0 || offset + length > buf.length) return null

  const readU32 = relativeOffset => buf.readUInt32LE(offset + relativeOffset)
  const readU16 = relativeOffset => buf.readUInt16LE(offset + relativeOffset)

  /*
   * The fixed portion now has a repeatable layout in the fixtures:
   *
   *   0..6    signal-input header (still being decoded)
   *   7..10   tank capacity, observed in 0.1 L units
   *   11..14  Low alarm/switch ON level
   *   15..18  Low alarm/switch OFF level
   *   19..22  High alarm/switch ON level
   *   23..26  High alarm/switch OFF level
   *   27..28  High delay, observed in 0.1 s units
   *   29..30  Low delay, observed in 0.1 s units
   *   31..34  Very Low alarm/switch ON level
   *   35..38  Very Low alarm/switch OFF level
   *   39..42  Very High alarm/switch ON level
   *   43..46  Very High alarm/switch OFF level
   *   47..48  Very High delay, observed in 0.1 s units
   *   49..50  Very Low delay, observed in 0.1 s units
   *   51      number of calibration points (equal to the point count in
   *           all 208 signal-input records of the fixtures)
   *   52, 53  not decoded. These were read as the alarm/switch enable
   *           bitmaps and severity codes when the next record's bytes were
   *           taken for a tank's settings (the "alarm enable" 0x05 of
   *           SugarShack Port Water Tank was Stbd Water Tank's 5 points).
   *           To be checked against the Configuration Tool.
   *   54..57  long layout only: 00 00 00 00 (then ff ff and the name)
   *
   * The level fields use the same 0..25000 scale as the calibration table.
   * The delay interpretation is supported by the Sugar Shack Port Water
   * configuration: 600.0 s appears as 6000 in both the Low and Very Low
   * delay fields.
   */
  const capacityRaw = readU32(7)
  const lowOnRaw = readU32(11)
  const lowOffRaw = readU32(15)
  const highOnRaw = readU32(19)
  const highOffRaw = readU32(23)
  const highDelayRaw = readU16(27)
  const lowDelayRaw = readU16(29)
  const veryLowOnRaw = readU32(31)
  const veryLowOffRaw = readU32(35)
  const veryHighOnRaw = readU32(39)
  const veryHighOffRaw = readU32(43)
  const veryHighDelayRaw = readU16(47)
  const veryLowDelayRaw = readU16(49)

  const level = levelRaw => ({
    raw: levelRaw,
    percent: levelRaw / 250
  })

  const delay = delayRaw => ({
    raw: delayRaw,
    seconds: delayRaw / 10
  })


  return {
    offset,
    length,
    headerHex: buf.subarray(offset, offset + 7).toString('hex'),
    header: Array.from(buf.subarray(offset, offset + 7)),
    capacityRaw,
    capacityLitres: capacityRaw / 10,
    low: {
      on: level(lowOnRaw),
      off: level(lowOffRaw),
      delay: delay(lowDelayRaw)
    },
    high: {
      on: level(highOnRaw),
      off: level(highOffRaw),
      delay: delay(highDelayRaw)
    },
    veryLow: {
      on: level(veryLowOnRaw),
      off: level(veryLowOffRaw),
      delay: delay(veryLowDelayRaw)
    },
    veryHigh: {
      on: level(veryHighOnRaw),
      off: level(veryHighOffRaw),
      delay: delay(veryHighDelayRaw)
    },
    calibrationCount: buf[offset + 51],
    alarmEnable: null, // bytes 52/53: not decoded yet (see above)
    switchEnable: null,
    severityCodes: null,
    trailingHex: buf.subarray(offset + 51, offset + length).toString('hex'),
    hex: buf.subarray(offset, offset + length).toString('hex')
  }
}

function readTankMonitorAt (buf, marker, endOffset) {
  const name = readNameMarker(buf, marker)
  if (!name) return null

  const next = findNameMarker(buf, name.nameEnd)
  const recordEnd = next
    ? next.offset
    : (Number.isInteger(endOffset) ? endOffset : buf.length)

  if (recordEnd <= name.nameEnd) return null

  const payloadLength = recordEnd - name.nameEnd
  if (payloadLength < MIN_CALIBRATION_POINTS * 4) return null

  let calibrationLength = payloadLength
  let configuration = null

  /*
   * If the record contains the fixed signal-input configuration, the
   * remaining prefix must be a valid calibration table. This is what
   * distinguishes a tank record from an unrelated named object: we don't
   * accept the 58-byte suffix unless the bytes before it decode cleanly as
   * 2..33 monotonic calibration points.
   */
  if (payloadLength >= CONFIGURATION_LENGTH + MIN_CALIBRATION_POINTS * 4) {
    const configurationOffset = recordEnd - CONFIGURATION_LENGTH
    const candidate = readSignalInputConfiguration(buf, configurationOffset)
    const candidateCalibrationLength = configurationOffset - name.nameEnd
    const candidateCalibration = candidate
      ? decodeCalibration(buf, name.nameEnd, candidateCalibrationLength)
      : null

    if (candidateCalibration) {
      configuration = readSignalInputConfiguration(buf, candidate.offset)
      calibrationLength = candidateCalibrationLength
    }
  }

  const calibration = decodeCalibration(buf, name.nameEnd, calibrationLength)
  if (!calibration) return null

  return {
    offset: marker,
    nameOffset: name.nameOffset,
    nameLength: name.nameLength,
    name: name.name,
    calibrationOffset: name.nameEnd,
    calibrationCount: calibration.length,
    calibration,
    configuration: configuration || null,
    configurationOffset: configuration ? configuration.offset : null,
    configurationLength: configuration ? configuration.length : null,
    configurationHeaderHex: configuration ? configuration.headerHex : null,
    configurationHex: configuration ? configuration.hex : null
  }
}

function fromSignalInputs (buffer, table) {
  const monitors = []
  for (const input of table.inputs) {
    // Tanks wired to a CZone module. A third-party sender (module 0) sends
    // its own level on NMEA 2000 and has no calibration here.
    if (input.type !== 'tank' || input.thirdParty) continue
    const calibration = input.calibrationPointSize === 4 || input.calibrationCount === 0
      ? decodeCalibration(buffer, input.calibrationOffset, input.calibrationCount * 4)
      : null
    const configuration = readSignalInputConfiguration(buffer, input.settingsOffset, input.settingsLength)
    monitors.push({
      offset: input.offset,
      nameOffset: input.nameOffset,
      nameLength: input.nameLength,
      name: input.name,
      module: input.module,
      input: input.input,
      fluidType: input.a,
      instance: input.b,
      calibrationOffset: input.calibrationOffset,
      calibrationCount: input.calibrationCount,
      calibration: calibration || [],
      configuration,
      configurationOffset: configuration ? configuration.offset : null,
      configurationLength: configuration ? configuration.length : null,
      configurationHeaderHex: configuration ? configuration.headerHex : null,
      configurationHex: configuration ? configuration.hex : null
    })
  }
  return {
    count: monitors.length,
    configurationLength: table.layout === 'long' ? CONFIGURATION_LENGTH : 54,
    layout: table.layout,
    levelScale: LEVEL_SCALE,
    monitors
  }
}

function parseTankMonitors (buffer, endOffset) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parseTankMonitors expects a Buffer')

  const table = parseSignalInputs(buffer)
  if (table) return fromSignalInputs(buffer, table)

  // No signal-input table found: calibration tables only, by the ff ff
  // name marker, without settings (see the note at the top).
  const monitors = []
  for (let offset = 0; offset + 3 <= buffer.length; offset++) {
    const marker = readNameMarker(buffer, offset)
    if (!marker) continue

    const monitor = readTankMonitorAt(buffer, marker.offset, endOffset)
    if (!monitor) continue

    monitors.push({ ...monitor, configuration: null, configurationOffset: null, configurationLength: null, configurationHeaderHex: null, configurationHex: null })

    const next = findNameMarker(buffer, marker.nameEnd)
    const recordEnd = next ? next.offset : (
      monitor.configurationOffset !== null
        ? monitor.configurationOffset + CONFIGURATION_LENGTH
        : marker.nameEnd + monitor.calibrationCount * 4
    )
    offset = recordEnd - 1
  }

  return {
    count: monitors.length,
    configurationLength: CONFIGURATION_LENGTH,
    layout: null,
    levelScale: LEVEL_SCALE,
    monitors
  }
}

module.exports = {
  parseTankMonitors,
  readTankMonitorAt,
  readSignalInputConfiguration,
  decodeCalibration,
  CONFIGURATION_LENGTH,
  LEVEL_SCALE,
  MIN_CALIBRATION_POINTS,
  MAX_CALIBRATION_POINTS
}
