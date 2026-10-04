'use strict'

/*
 * Structural parser for CZone tank-monitor records.
 *
 * A signal-input object is name-delimited:
 *
 *   ff ff nameLength name
 *   calibrationPoint[variable count]
 *   signalInputConfiguration[fixed 58 bytes, optional]
 *
 * The calibration table is variable length. CZone's Configuration Tool
 * supports 2..33 calibration points, and each point is four bytes:
 *
 *   u16 senderValue
 *   u16 levelRaw
 *
 * The signal-input configuration is a fixed 58-byte structure shared with
 * non-tank signal inputs. It is not an arbitrary trailing payload. Some tank
 * inputs have no Alarm/Switch configuration and therefore end immediately
 * after their calibration table.
 *
 * Across the current ZCF fixtures, levelRaw uses a 0..25000 scale, so the
 * decoded percentage is levelRaw / 250. Raw sender values are retained.
 */

const NAME_MARKER = 0xffff
const CONFIGURATION_LENGTH = 58
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
 * The 58-byte suffix is a fixed signal-input configuration block. We are
 * deliberately only identifying its structure here; field semantics beyond
 * the byte-level layout are still being reverse-engineered.
 *
 * The fixed block contains:
 *   0..6   signal-input header
 *   7..26  five u32 values
 *   27..30 delay/settings value
 *   31..46 four u32 values
 *   47..50 delay/settings value
 *   51..57 trailing switch/alarm/control fields
 *
 * The nine u32 level fields are all on the same 0..25000 scale in the
 * observed signal-input records. The remaining fields are retained raw.
 */
function isSignalInputConfiguration (buf, offset) {
  if (offset < 0 || offset + CONFIGURATION_LENGTH > buf.length) return false

  for (const relative of [7, 11, 15, 19, 23, 31, 35, 39, 43]) {
    if (buf.readUInt32LE(offset + relative) > LEVEL_SCALE) return false
  }

  return true
}

function readSignalInputConfiguration (buf, offset) {
  if (!isSignalInputConfiguration(buf, offset)) return null

  return {
    offset,
    length: CONFIGURATION_LENGTH,
    headerHex: buf.subarray(offset, offset + 7).toString('hex'),
    hex: buf.subarray(offset, offset + CONFIGURATION_LENGTH).toString('hex')
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

  if (payloadLength >= CONFIGURATION_LENGTH + MIN_CALIBRATION_POINTS * 4) {
    const configurationOffset = recordEnd - CONFIGURATION_LENGTH
    configuration = readSignalInputConfiguration(buf, configurationOffset)

    if (configuration) {
      calibrationLength = configurationOffset - name.nameEnd
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
    configurationOffset: configuration ? configuration.offset : null,
    configurationLength: configuration ? configuration.length : null,
    configurationHeaderHex: configuration ? configuration.headerHex : null,
    configurationHex: configuration ? configuration.hex : null
  }
}

function parseTankMonitors (buffer, endOffset) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parseTankMonitors expects a Buffer')

  const monitors = []
  for (let offset = 0; offset + 3 <= buffer.length; offset++) {
    const marker = readNameMarker(buffer, offset)
    if (!marker) continue

    const monitor = readTankMonitorAt(buffer, marker.offset, endOffset)
    if (!monitor) continue

    monitors.push(monitor)

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
    levelScale: LEVEL_SCALE,
    monitors
  }
}

module.exports = {
  parseTankMonitors,
  readTankMonitorAt,
  readSignalInputConfiguration,
  isSignalInputConfiguration,
  decodeCalibration,
  CONFIGURATION_LENGTH,
  LEVEL_SCALE,
  MIN_CALIBRATION_POINTS,
  MAX_CALIBRATION_POINTS
}
