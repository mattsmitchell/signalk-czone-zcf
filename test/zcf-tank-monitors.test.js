'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { parseTankMonitors } = require('../lib/zcf-tank-monitors')

const fixture = name => path.join(__dirname, 'fixtures', name)
const readFixture = name => parseTankMonitors(fs.readFileSync(fixture(name)))

{
  const ss = readFixture('SugarShack-20260927-01.zcf')
  assert.strictEqual(ss.count, 4)
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
}

for (const name of [
  'Compass-Rose-28.06.26.zcf',
  'Persevere-14.07.25.zcf',
  'Sel-Citron-02.04.25.zcf',
  'TestBench.zcf'
]) {
  assert.strictEqual(readFixture(name).count, 0, `no tank monitors: ${name}`)
}

console.log('ZCF tank monitor parser tests passed')
