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

/*
 * Attach the best CZone status identity known from the ZCF.
 *
 * This belongs in the ZCF library because it describes the relationship
 * between a circuit and the status/load representation in the configuration,
 * not how a particular consumer publishes that state.
 */
function attachStatusMappings (records, statusMap, statusOutputMap, statusTable) {
  return records.map(record => {
    let status = statusMap.get(record.name) || null
    let statusConfidence = status ? 'zcf-derived' : null
    let statusSource = status ? 'status-name' : null

    if (!status && statusOutputMap && Array.isArray(record.outputs)) {
      const candidates = []
      for (const output of record.outputs) {
        if (!Number.isInteger(output.module) || !Number.isInteger(output.channel)) continue
        const candidate = statusOutputMap.get(`${output.module}:${output.channel}`) || null
        if (candidate && !candidates.some(item => item.offset === candidate.offset)) {
          candidates.push(candidate)
        }
      }

      if (candidates.length === 1) {
        status = candidates[0]
        statusConfidence = 'zcf-output-derived'
        statusSource = 'status-output'
      } else {
        const acCandidates = candidates.filter(candidate => candidate.statusModule === 0xF8)
        if (acCandidates.length === 1) {
          status = acCandidates[0]
          statusConfidence = 'zcf-output-derived'
          statusSource = 'status-output'
        }
      }
    }

    // When a circuit has no usable status-table record, its primary output
    // identity is itself the best known CZone status identity:
    // module -> status module, channel -> status bit.
    if (!status &&
      Array.isArray(record.outputs) &&
      record.outputs.length > 0 &&
      Number.isInteger(record.outputs[0].module) &&
      Number.isInteger(record.outputs[0].channel) &&
      record.outputs[0].channel >= 0 &&
      record.outputs[0].channel <= 31) {
      const output = record.outputs[0]
      status = {
        name: record.name,
        statusModule: output.module,
        statusBit: output.channel,
        statusMask: (1 << output.channel) >>> 0,
        statusFormat: 'primary-module-channel-fallback'
      }
      statusConfidence = 'primary-module-channel-fallback'
      statusSource = 'primary-module-channel'
    }

    return {
      ...record,
      statusModule: status ? status.statusModule : null,
      statusBit: status ? status.statusBit : null,
      statusMask: status ? status.statusMask : null,
      statusFormat: status ? status.statusFormat : null,
      statusConfidence,
      statusSource
    }
  })
}

/*
 * Normalize the structural circuit record into the canonical CZone model.
 * Consumers should not need to reconstruct module/channel/page/slot or status
 * relationships from the raw table representation.
 */
function buildCircuitModel (records, statusMap, statusOutputMap, statusTable) {
  return attachStatusMappings(records, statusMap, statusOutputMap, statusTable).map(record => {
    const primary = record.outputs[0] || null
    const channel = primary ? primary.channel : null
    const module = primary ? primary.module : null

    return {
      ...record,
      module,
      channel,
      page: Number.isInteger(channel) ? Math.floor(channel / 8) : null,
      slot: Number.isInteger(channel) ? channel % 8 : null,
      primaryOutput: primary,
      status: record.statusSource
        ? {
            module: record.statusModule,
            bit: record.statusBit,
            mask: record.statusMask,
            format: record.statusFormat,
            confidence: record.statusConfidence,
            source: record.statusSource
          }
        : null
    }
  })
}

function parse (buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parse expects a Buffer')
  if (buffer.length < 32) throw new Error('ZCF data is too small')

  const circuitTable = parseCircuitTable(buffer)
  if (!circuitTable) throw new Error('CZone circuit table not found in ZCF')

  const statusTable = parseStatusTable(buffer, circuitTable)
  const modules = parseModuleDeclarations(buffer)
  const statusByName = buildStatusMap(statusTable)
  const statusByOutput = buildStatusOutputMap(statusTable)

  const structuralCircuits = parseCircuits(buffer)
  const circuits = buildCircuitModel(
    structuralCircuits,
    statusByName,
    statusByOutput,
    statusTable
  )

  return {
    circuitTable,
    statusTable,
    circuits,
    structuralCircuits,
    modes: parseModes(buffer),
    statusByName,
    statusByOutput,
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

module.exports = {
  parse,
  load,
  extractVesselName,
  parseModuleDeclarations,
  attachStatusMappings,
  buildCircuitModel
}
