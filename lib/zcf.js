'use strict'

const fs = require('fs')
const path = require('path')
const { parseCircuitTable, parseCircuits, parseModes } = require('./zcf-circuit-table')
const { parseStatusTable, buildStatusMap, buildStatusOutputMap } = require('./zcf-status-table')
const { parseModuleDeclarations } = require('./zcf-modules')

function isAsciiName (buf, offset, length) {
  if (length < 1 || length > 120 || offset + length > buf.length) return false
  for (let i = offset; i < offset + length; i++) {
    if (buf[i] < 0x20 || buf[i] > 0x7e) return false
  }
  return true
}

function extractVesselName (buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null
  const length = buf[14]
  if (length < 1 || length > 120 || 15 + length > buf.length) return null
  if (!isAsciiName(buf, 15, length)) return null
  return buf.subarray(15, 15 + length).toString('ascii').trim() || null
}

function parse (buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parse expects a Buffer')
  if (buffer.length < 32) throw new Error('ZCF data is too small')

  const circuitTable = parseCircuitTable(buffer)
  if (!circuitTable) throw new Error('CZone circuit table not found in ZCF')

  const statusTable = parseStatusTable(buffer, circuitTable)
  const modules = parseModuleDeclarations(buffer)

  return {
    circuitTable,
    statusTable,
    circuits: parseCircuits(buffer),
    modes: parseModes(buffer),
    statusByName: buildStatusMap(statusTable),
    statusByOutput: buildStatusOutputMap(statusTable),
    vesselName: extractVesselName(buffer),
    modules,
    moduleAddresses: modules.map(module => module.module)
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

module.exports = { parse, load, extractVesselName, parseModuleDeclarations }
