'use strict'

/*
 * Structural parser for the CZone signal-input table (the Configuration
 * Tool's "Inputs" tab: switch inputs, tank and temperature senders, and
 * third-party senders).
 *
 * Like the circuit table, it is read by its own length and count fields and
 * only accepted if exactly `count` records end exactly at the declared length:
 *
 *   u32 tableLength | u16 count | u8 header | record x count
 *
 *   record:
 *     0      input number on the module (third-party senders: 0..n)
 *     1      module dipswitch (0x00 = third-party sender on NMEA 2000)
 *     2      wiring: 0x04 switch to positive, 0x05 switch to negative,
 *            0x01 resistive sender, ...
 *     3      kind: 0x0c temperature, 0x0f refrigeration temperature,
 *            0x08 pressure, 0x0b voltage/current, tanks 0x04 / 0x44 / 0x84 /
 *            0x07, 0x00-0x02 switch
 *     4      flags
 *     5      a: tank fluid type, temperature or pressure source
 *     6      b: NMEA 2000 instance
 *     7..50  settings (tank capacity at 7, alarm levels and delays; see
 *            readSignalInputConfiguration in zcf-tank-monitors.js)
 *     51     number of calibration points that follow the name
 *     52, 53 not decoded
 *     then, in the long layout only: 00 00 00 00 ff ff
 *     u8 nameLength | name
 *     calibration points, 4 bytes each (6 for kind 0x0b)
 *
 * Two layouts are in use. The long one (53 bytes from 7 to the name length)
 * is in the April 2025 Meitaki, Sel Citron, SugarShack and Persevere files.
 * The short one (47 bytes, no 00 00 00 00 ff ff) is in the October 2026
 * Meitaki file (the same boat, re-saved by a newer Configuration Tool) and in
 * the Compass Rose and TestBench files. Byte 51 is the calibration-point count
 * in every record of every fixture (208 records).
 */

const LONG = 53
const SHORT = 47

const WIRING = { 0x01: 'resistive', 0x04: 'switchToPos', 0x05: 'switchToNeg' }
const FLUID = { 0: 'fuel', 1: 'freshWater', 2: 'wasteWater', 3: 'liveWell', 4: 'lubrication', 5: 'blackWater' }

function classify (wiring, kind) {
  if (wiring === 0x04 || wiring === 0x05) return 'switch'
  if (kind === 0x0c || kind === 0x0f) return 'temperature'
  if (kind === 0x08) return 'pressure'
  if (kind === 0x0b) return 'electrical'
  if (kind === 0x07 || (kind & 0x0f) === 0x04) return 'tank'
  return 'analog'
}

function printableName (buf) {
  if (!buf.length) return false
  let letters = 0
  for (const c of buf) {
    if (c < 0x20 || c === 0x7f) return false
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) letters++
  }
  return letters >= 2
}

function tableHeader (buf, h) {
  if (h + 7 > buf.length) return null
  const length = buf.readUInt32LE(h)
  const count = buf.readUInt16LE(h + 4)
  const end = h + 4 + length
  if (count < 1 || count > 250 || length < 30 || end > buf.length) return null
  return { length, count, end, header: buf[h + 6] }
}

// The name of the record starting at p, in a layout of `body` bytes.
function nameAt (buf, p, end, body) {
  const lp = p + 7 + body
  if (lp >= end) return null
  const n = buf[lp]
  if (n < 1 || n > 64 || lp + 1 + n > end) return null
  if (!printableName(buf.subarray(lp + 1, lp + 1 + n))) return null
  if (body === LONG && !(buf[lp - 1] === 0xff && buf[lp - 2] === 0xff)) return null
  return { lp, n, after: lp + 1 + n, points: buf[p + 51] }
}

function readTableAt (buf, h) {
  const t = tableHeader(buf, h)
  if (!t) return null
  for (const body of [LONG, SHORT]) {
    const inputs = []
    let p = h + 7
    let ok = true
    for (let i = 0; i < t.count; i++) {
      const r = nameAt(buf, p, t.end, body)
      if (!r) { ok = false; break }
      const kind = buf[p + 3]
      // Point size: 4 bytes, 6 for voltage/current; the next record (or the
      // table end) must follow exactly.
      let next = null
      let pointSize = 0
      if (r.points === 0) {
        next = r.after
      } else {
        for (const size of kind === 0x0b ? [6, 4] : [4, 6]) {
          const candidate = r.after + r.points * size
          const fits = i === t.count - 1 ? candidate === t.end : nameAt(buf, candidate, t.end, body) !== null
          if (fits) { next = candidate; pointSize = size; break }
        }
      }
      if (next === null) { ok = false; break }
      const wiring = buf[p + 2]
      inputs.push({
        offset: p,
        input: buf[p],
        module: buf[p + 1],
        thirdParty: buf[p + 1] === 0,
        wiringCode: wiring,
        wiring: WIRING[wiring] || null,
        kind,
        type: classify(wiring, kind),
        flags: buf[p + 4],
        a: buf[p + 5],
        b: buf[p + 6],
        settingsOffset: p,
        settingsLength: body + 7 - (body === LONG ? 2 : 0), // up to the ff ff marker in the long layout
        nameOffset: r.lp + 1,
        nameLength: r.n,
        name: buf.subarray(r.lp + 1, r.lp + 1 + r.n).toString('utf8'),
        calibrationOffset: r.after,
        calibrationCount: r.points,
        calibrationPointSize: pointSize,
        end: next
      })
      p = next
    }
    if (ok && p === t.end) {
      return { offset: h, length: t.length, count: t.count, header: t.header, layout: body === LONG ? 'long' : 'short', recordLength: body, inputs }
    }
  }
  return null
}

function parseSignalInputs (buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parseSignalInputs expects a Buffer')
  for (let h = 0; h + 7 <= buffer.length; h++) {
    const table = readTableAt(buffer, h)
    if (table) return table
  }
  return null
}

module.exports = { parseSignalInputs, classify, WIRING, FLUID }
