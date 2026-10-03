'use strict'

const fs = require('fs')
const path = require('path')
const zcf = require('./lib/zcf')
const circuitTable = require('./lib/zcf-circuit-table')
const statusTable = require('./lib/zcf-status-table')
const { parseModuleDeclarations } = require('./lib/zcf-modules')

function parse (buffer) {
  const parsed = zcf.parse(buffer)
  const modules = parseModuleDeclarations(buffer)
  return {
    ...parsed,
    modules,
    moduleAddresses: modules.map(module => module.module)
  }
}

function load (filePath) {
  if (!filePath || typeof filePath !== 'string') throw new Error('No ZCF file path configured')
  const resolved = path.resolve(filePath)
  const parsed = parse(fs.readFileSync(resolved))
  return {
    ...parsed,
    fileName: path.basename(resolved),
    filePath: resolved,
    fileSize: fs.statSync(resolved).size
  }
}

module.exports = {
  ...zcf,
  ...circuitTable,
  ...statusTable,
  parse,
  load,
  parseModuleDeclarations
}
