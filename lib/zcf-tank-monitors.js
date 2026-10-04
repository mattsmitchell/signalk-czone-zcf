'use strict'

/*
 * Structural parser for CZone tank-monitor records.
 *
 * These records are not part of the electrical Meters table. They appear in
 * the load/object list as:
 *
 *   ff ff nameLength name
 *   calibrationPoint[variable count]
 *   associatedObject[optional 58 bytes]
 *
 * Each calibration point is:
 *   u16 senderValue
 *   u16 levelRaw
 *
 * Across the current ZCF fixtures, levelRaw uses a 0..25000 scale, so the
 * decoded percentage is levelRaw / 250. The raw values are retained because
 * the senderValue units have not yet been established.
 *
 * The trailing 58-byte object is preserved as raw data when present. Some
 * tank records end directly at the following table and contain calibration
 * data only.
 */

const NAME_MARKER = 0xffff
const ASSOCIATED_OBJECT_LENGTH = 58
const LEVEL_SCALE = 25000

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
  if (length < 8 || length % 4 !== 0) return null

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

function readTankMonitorAt (buf, marker, endOffset) {
  const name = readNameMarker(buf, marker)
  if (!name) return null

  const next = findNameMarker(buf, name.nameEnd)
  const recordEnd = next
    ? next.offset
    : (Number.isInteger(endOffset) ? endOffset : buf.length)

  if (recordEnd <= name.nameEnd) return null

  const payloadLength = recordEnd - name.nameEnd
  if (payloadLength < 8) return null

  let calibrationLength
  let associatedObjectOffset = null
  let associatedObject = Buffer.alloc(0)

  if (payloadLength > ASSOCIATED_OBJECT_LENGTH &&
    (payloadLength - ASSOCIATED_OBJECT_LENGTH) % 4 === 0) {
    calibrationLength = payloadLength - ASSOCIATED_OBJECT_LENGTH
    associatedObjectOffset = name.nameEnd + calibrationLength
    associatedObject = buf.subarray(
      associatedObjectOffset,
      associatedObjectOffset + ASSOCIATED_OBJECT_LENGTH
    )
  } else if (payloadLength % 4 === 0) {
    calibrationLength = payloadLength
  } else {
    return null
  }

  if (calibrationLength < 8) return null

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
    associatedObjectOffset,
    associatedObjectLength: associatedObject.length || null,
    associatedObjectHex: associatedObject.length
      ? associatedObject.toString('hex')
      : null
  }
}

function parseTankMonitors (buffer, endOffset) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parseTankMonitors expects a Buffer')

  const monitors = []
  for (let offset = 0; offset + 3 <= buffer.length; offset++) {
    const marker = readNameMarker(buffer, offset)
    if (!marker) continue

    const monitor = readTankMonitorAt(buffer, offset, endOffset)
    if (!monitor) continue

    monitors.push(monitor)

    const next = findNameMarker(buffer, marker.offset + 3 + marker.nameLength)
    const recordEnd = monitor.associatedObjectOffset
      ? monitor.associatedObjectOffset + ASSOCIATED_OBJECT_LENGTH
      : marker.nameOffset + marker.nameLength + monitor.calibrationCount * 4
    offset = (next ? next.offset : recordEnd) - 1
  }

  return {
    count: monitors.length,
    associatedObjectLength: ASSOCIATED_OBJECT_LENGTH,
    levelScale: LEVEL_SCALE,
    monitors
  }
}

module.exports = {
  parseTankMonitors,
  readTankMonitorAt,
  decodeCalibration,
  ASSOCIATED_OBJECT_LENGTH,
  LEVEL_SCALE
}
