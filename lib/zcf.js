'use strict'

const fs = require('fs')
const path = require('path')
const { parseCircuitTable, parseCircuits, parseModes } = require('./zcf-circuit-table')
const { parseStatusTable, buildStatusMap, buildStatusOutputMap } = require('./zcf-status-table')

function parse (buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parse expects a Buffer')
  if (buffer.length < 32) throw new Error('ZCF data is too small')

  const circuitTable = parseCircuitTable(buffer)
  if (!circuitTable) throw new Error('CZone circuit table not found in ZCF')

  const statusTable = parseStatusTable(buffer, circuitTable)

  return {
    circuitTable,
    statusTable,
    circuits: parseCircuits(buffer),
    modes: parseModes(buffer),
    statusByName: buildStatusMap(statusTable),
    statusByOutput: buildStatusOutputMap(statusTable)
  }
}

function load (filePath) {
  if (!filePath || typeof filePath !== 'string') throw new Error('No ZCF file path configured')
  const resolved = path.resolve(filePath)
  const buffer = fs.readFileSync(resolved)
  const parsed = parse(buffer)
  return {
    ...parsed,
    fileName: path.basename(resolved),
    filePath: resolved,
    fileSize: buffer.length
  }
}

module.exports = { parse, load }
