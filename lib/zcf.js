'use strict'

const fs = require('fs')
const path = require('path')
const { parseCircuitTable, parseCircuits } = require('./zcf-circuit-table')
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

function findDimmingObject (buf, afterName) {
  const marker = Buffer.from([0x0F, 0x01, 0x00, 0x00])
  const window = buf.subarray(afterName, Math.min(buf.length, afterName + 32))
  const offset = window.indexOf(marker)
  return offset >= 0 ? { offset: afterName + offset, marker: '0f010000' } : null
}

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
        if (candidate && !candidates.some(item => item.offset === candidate.offset)) candidates.push(candidate)
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

    if (!status && Array.isArray(record.outputs) && record.outputs.length > 0) {
      const output = record.outputs[0]
      if (Number.isInteger(output.module) && Number.isInteger(output.channel) && output.channel >= 0 && output.channel <= 31) {
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

function buildCircuitModel (records, statusMap, statusOutputMap, statusTable, buffer, modules = []) {
  return attachStatusMappings(records, statusMap, statusOutputMap, statusTable).map(record => {
    const primary = record.outputs[0] || null
    const channel = primary ? primary.channel : null
    const module = primary ? primary.module : null
    const dimmerObject = buffer ? findDimmingObject(buffer, record.offset + 8 + record.name.length) : null

    const controls = (record.controls || []).map(control => {
      const controlModule = control.module === 0
        ? null
        : modules.find(item => item.module === control.module) || null

      return {
        ...control,
        controlModuleId: control.module,
        controlModuleName: control.module === 0
          ? 'All Display Interfaces'
          : (controlModule ? controlModule.name : null),
        controlModuleType: controlModule ? controlModule.type : null,
        controlModule: control.module === 0
          ? 'All Display Interfaces'
          : (controlModule ? controlModule.name : null)
      }
    })

    const displayControls = controls.filter(control =>
      control.module === 0 ||
      control.controlModuleType === 16 ||
      control.controlModuleType === 17
    )

    const virtualOutputs = record.outputs.filter(output =>
      Number.isInteger(output.channel) && output.channel >= 32
    )
    const realOutputs = record.outputs.filter(output =>
      !Number.isInteger(output.channel) || output.channel < 32
    )
    const virtualOnly = record.outputs.length > 0 && realOutputs.length === 0
    const onDisplay = displayControls.length > 0

    return {
      ...record,
      module,
      channel,
      page: Number.isInteger(channel) ? Math.floor(channel / 8) : null,
      slot: Number.isInteger(channel) ? channel % 8 : null,
      primaryOutput: primary,
      capabilities: { switch: true, dimmer: Boolean(dimmerObject) },
      zcfCircuitId: record.id,
      categories: {
        master: record.masterCategories,
        sub: record.subCategories,
        userDefined: record.userSubCategories
      },
      display: {
        onDisplay,
        controlCount: displayControls.length,
        controls: displayControls
      },
      virtual: {
        virtualOnly,
        outputCount: virtualOutputs.length,
        outputs: virtualOutputs
      },
      showInCircuitList: !virtualOnly && onDisplay,
      zcf: {
        category: {
          masterCategories: record.masterCategories,
          subCategories: record.subCategories,
          userSubCategories: record.userSubCategories,
          subCategoryBits: record.subCategoryBits ?? 0,
          categoryWord: record.categoryWord ?? record.category ?? 0,
          unknownSubCategoryBits: record.unknownSubCategoryBits ?? 0,
          unknownCategoryWordBits: record.unknownCategoryWordBits ?? 0,
          hex: `${(record.subCategoryBits ?? 0).toString(16).padStart(8, '0')}${(record.categoryWord ?? record.category ?? 0).toString(16).padStart(4, '0')}`
        },
        offset: record.offset,
        nameOffset: record.offset + 8,
        nameLength: record.name.length,
        flags: record.flags,
        controlsHex: record.controlsHex,
        controlsTrailingHex: record.controlsTrailingHex,
        controls,
        displayControls,
        outputCount: record.outputs.length,
        outputs: record.outputs,
        dimmerObject,
        statusRecord: record.statusSource ? {
          name: record.name,
          statusModule: record.statusModule,
          statusBit: record.statusBit,
          statusMask: record.statusMask,
          statusFormat: record.statusFormat
        } : null,
        statusSource: record.statusSource,
        statusTableFormat: statusTable ? statusTable.format : null
      },
      status: record.statusSource ? {
        module: record.statusModule,
        bit: record.statusBit,
        mask: record.statusMask,
        format: record.statusFormat,
        confidence: record.statusConfidence,
        source: record.statusSource
      } : null
    }
  })
}

function findModeHeaders (buf) {
  const modes = []
  for (let p = 2; p + 6 <= buf.length; p++) {
    if (buf[p] !== 0x01 || buf[p + 3] !== 0x00 || buf[p + 4] !== 0x00) continue
    const runtimeId = buf[p - 2]
    const modeGroupId = buf[p]
    const id = buf.readUInt16LE(p + 1)
    const nameLength = buf[p + 5]
    if (id < 900 || id > 2000 || !isAsciiName(buf, p + 6, nameLength)) continue
    const name = buf.subarray(p + 6, p + 6 + nameLength).toString('ascii')
    modes.push({ offset: p - 2, runtimeId, modeGroupId, id, name, nameLength, nameOffset: p + 6 })
    p += 5 + nameLength
  }
  return modes
}

function modeSlug (name) {
  return String(name).trim().replace(/[^A-Za-z0-9]+(.)/g, (_, ch) => ch.toUpperCase()).replace(/[^A-Za-z0-9]/g, '').replace(/^[^A-Za-z]+/, '').replace(/^./, ch => ch.toLowerCase()) || 'mode'
}

function parseModes (buf) {
  const headers = findModeHeaders(buf)
  return headers.map((h, i) => {
    const afterName = h.nameOffset + h.nameLength
    const next = i + 1 < headers.length ? headers[i + 1].offset : Math.min(buf.length, afterName + 512)
    const raw = buf.subarray(afterName, Math.min(next, afterName + 512))
    const actionCount = raw.length > 17 ? raw[17] : 0
    const actionStart = 19
    const availableActions = Math.floor(Math.max(0, raw.length - actionStart) / 5)
    const actions = []
    for (let j = 0; j < Math.min(actionCount, availableActions); j++) {
      const p = actionStart + j * 5
      actions.push({
        index: j,
        target: {
          byte0: raw[p],
          byte1: raw[p + 1],
          hex: `${raw[p].toString(16).padStart(2, '0')}${raw[p + 1].toString(16).padStart(2, '0')}`
        },
        value: raw.readUInt16LE(p + 2),
        valuePercent: raw.readUInt16LE(p + 2) / 10,
        terminator: raw[p + 4]
      })
    }
    return {
      id: h.id,
      runtimeId: h.runtimeId,
      modeGroupId: h.modeGroupId,
      name: h.name,
      slug: modeSlug(h.name),
      actionCount,
      parsedActionCount: actions.length,
      truncated: availableActions < actionCount,
      actions,
      zcf: {
        offset: h.offset,
        nameOffset: h.nameOffset,
        nameLength: h.nameLength,
        rawPayloadHex: raw.toString('hex')
      }
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
  const circuits = buildCircuitModel(structuralCircuits, statusByName, statusByOutput, statusTable, buffer, modules)

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
  return { ...parse(buffer), fileName: path.basename(resolved), filePath: resolved, fileSize: buffer.length }
}

module.exports = {
  parse,
  load,
  extractVesselName,
  parseModuleDeclarations,
  attachStatusMappings,
  buildCircuitModel,
  findDimmingObject,
  findModeHeaders,
  parseModes
}
