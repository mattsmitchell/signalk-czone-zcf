'use strict'

const zcf = require('./lib/zcf')
const circuitTable = require('./lib/zcf-circuit-table')
const statusTable = require('./lib/zcf-status-table')

module.exports = {
  ...zcf,
  ...circuitTable,
  ...statusTable
}
