'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { parseTankMonitors } = require('../lib/zcf-tank-monitors')
const { parseMeters } = require('../lib/zcf-meters')
const zcf = require('../')

const fixture = name => path.join(__dirname, 'fixtures', name)
const readFixture = name => {
  const buffer = fs.readFileSync(fixture(name))
  const meters = parseMeters(buffer)
  return parseTankMonitors(buffer, meters ? meters.offset : null)
}

{
  const ss = readFixture('SugarShack-20260927-01.zcf')
  assert.strictEqual(ss.count, 4)
  assert.strictEqual(ss.configurationLength, 58)
  assert.deepStrictEqual(
    ss.monitors.map(m => m.name),
    ['Port Water Tank', 'Stbd Water Tank', 'Port Fuel Tank', 'Stbd Fuel Tank']
  )

  assert.deepStrictEqual(
    ss.monitors.map(m => m.calibration.map(p => [p.senderValue, p.levelRaw])),
    [
      [[400, 2500], [800, 12500], [1200, 18750], [1700, 25000]],
      [[30, 0], [450, 6250], [885, 12500], [1307, 18750], [1740, 25000]],
      [[100, 0], [425, 6250], [850, 12500], [1275, 18750], [1800, 25000]],
      [[100, 0], [425, 6250], [850, 12500], [1275, 18750], [1800, 25000]]
    ]
  )

  assert.strictEqual(ss.monitors[0].calibration[3].levelPercent, 100)
  assert.strictEqual(ss.monitors[1].calibration[1].levelPercent, 25)

  // Each tank's settings come from the start of its own record (before its
  // name). They used to be read from the bytes after its calibration table,
  // which are the next input's record: Stbd Water Tank then showed 0 L and
  // levels 60/80 % and 32/28 %, and Stbd Fuel Tank no settings at all.
  assert.strictEqual(ss.layout, 'long')
  assert.deepStrictEqual(ss.monitors.map(m => [m.configurationLength, m.configurationHeaderHex, m.configurationOffset === m.offset]), [
    [58, '151a0104320102', true],
    [58, '161a0104320103', true],
    [58, '131c0104330000', true],
    [58, '141c0104330001', true]
  ])
  assert.deepStrictEqual(ss.monitors.map(m => [m.module, m.input, m.configuration.capacityLitres]), [[26, 21, 400], [26, 22, 400], [28, 19, 400], [28, 20, 400]])

  const portWaterConfig = ss.monitors[0].configuration
  assert.strictEqual(portWaterConfig.capacityLitres, 400)
  assert.deepStrictEqual(
    {
      low: [portWaterConfig.low.on.percent, portWaterConfig.low.off.percent],
      high: [portWaterConfig.high.on.percent, portWaterConfig.high.off.percent],
      veryLow: [portWaterConfig.veryLow.on.percent, portWaterConfig.veryLow.off.percent],
      veryHigh: [portWaterConfig.veryHigh.on.percent, portWaterConfig.veryHigh.off.percent]
    },
    {
      low: [25, 30],
      high: [75, 70],
      veryLow: [10, 15],
      veryHigh: [90, 85]
    }
  )
  assert.strictEqual(portWaterConfig.low.delay.seconds, 600)
  assert.strictEqual(portWaterConfig.veryLow.delay.seconds, 600)
  assert.strictEqual(portWaterConfig.high.delay.seconds, 0)
  // Byte 51 is the calibration-point count; bytes 52/53 are not decoded yet.
  assert.deepStrictEqual(ss.monitors.map(m => m.configuration.calibrationCount), ss.monitors.map(m => m.calibration.length))
  assert.deepStrictEqual([portWaterConfig.alarmEnable, portWaterConfig.switchEnable, portWaterConfig.severityCodes], [null, null, null])
  assert.deepStrictEqual(ss.monitors[1].configuration.low.on.percent, 25) // Stbd Water Tank, read from its own record

  const portFuelConfig = ss.monitors[2].configuration
  assert.strictEqual(portFuelConfig.capacityLitres, 400)
  assert.strictEqual(portFuelConfig.low.delay.seconds, 0)
  assert.strictEqual(portFuelConfig.veryLow.delay.seconds, 0)

  const parsed = zcf.parse(fs.readFileSync(fixture('SugarShack-20260927-01.zcf')))
  assert.strictEqual(parsed.tankMonitors.count, 4)
}

{
  const mei = readFixture('Meitaki-07.04.25.zcf')
  assert.strictEqual(mei.count, 6)
  assert.deepStrictEqual(
    mei.monitors.map(m => m.name),
    [
      'Blk Water Tank Stbd',
      'Fresh Water Tank',
      'Blk Water Tank Port',
      'Fuel Tank Port',
      'Fuel Tank Stbd',
      'Blk Water Tank Aft'
    ]
  )

  const fresh = mei.monitors.find(m => m.name === 'Fresh Water Tank')
  assert.deepStrictEqual(
    fresh.calibration.map(p => [p.senderValue, p.levelRaw]),
    [[0, 0], [3556, 20000], [4400, 22500], [4750, 25000]]
  )

  const blackPort = mei.monitors.find(m => m.name === 'Blk Water Tank Port')
  assert.deepStrictEqual(
    blackPort.calibration.map(p => [p.senderValue, p.levelRaw]),
    [[0, 0], [3520, 18750], [4300, 25000]]
  )

  const fuelPort = mei.monitors.find(m => m.name === 'Fuel Tank Port')
  assert.deepStrictEqual(
    fuelPort.calibration.map(p => [p.senderValue, p.levelRaw]),
    [[64, 0], [1662, 25000]]
  )
  // Own capacities (Fuel Tank Port used to show Fuel Tank Stbd's 275 L).
  assert.deepStrictEqual(mei.monitors.map(m => m.configuration.capacityLitres), [85, 800, 85, 680, 275, 85])

  // The same boat re-saved by a newer Configuration Tool (October 2026):
  // the short record layout (no 00 00 00 00 ff ff before the name). Same
  // tanks, calibration and settings.
  const mei26 = readFixture('Meitaki-2026-10-15.zcf')
  assert.deepStrictEqual([mei.layout, mei26.layout, mei26.count], ['long', 'short', 6])
  const summary = r => r.monitors.map(m => [m.name, m.module, m.input, m.calibration.map(p => [p.senderValue, p.levelRaw]), m.configuration.capacityLitres, m.configuration.low.on.raw, m.configuration.high.on.raw])
  assert.deepStrictEqual(summary(mei26), summary(mei))
  assert.deepStrictEqual(mei26.monitors.map(m => m.configurationLength), [54, 54, 54, 54, 54, 54])
  assert.strictEqual(zcf.parse(fs.readFileSync(fixture('Meitaki-2026-10-15.zcf'))).tankMonitors.count, 6)
}

{
  const sel = readFixture('Sel-Citron-02.04.25.zcf')
  assert.strictEqual(sel.count, 6)
  assert.deepStrictEqual(
    sel.monitors.map(m => m.name),
    [
      'Black Water Level - Port',
      'Fresh Water Level - Port',
      'Fuel Level - Port',
      'Fuel Level - STBD',
      'Black Water Level - STBD',
      'Fresh Water Level - STBD'
    ]
  )

  assert.deepStrictEqual(
    sel.monitors[0].calibration.map(p => [p.senderValue, p.levelRaw]),
    [[4000, 0], [8000, 6250], [12000, 12500], [16000, 18750], [20000, 25000]]
  )
  assert.deepStrictEqual(
    sel.monitors[2].calibration.map(p => [p.senderValue, p.levelRaw]),
    [[0, 0], [1000, 5000], [2000, 10000], [3000, 15000], [4000, 20000], [5000, 25000]]
  )
}

for (const name of [
  'Compass-Rose-28.06.26.zcf',
  'Persevere-14.07.25.zcf',
  'TestBench.zcf'
]) {
  assert.strictEqual(readFixture(name).count, 0, `no tank monitors: ${name}`)
}

console.log('ZCF tank monitor parser tests passed')
