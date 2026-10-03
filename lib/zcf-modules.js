'use strict'

function isAsciiName (buf, offset, length) {
  if (length < 1 || length > 120 || offset + length > buf.length) return false
  for (let i = offset; i < offset + length; i++) {
    if (buf[i] < 0x20 || buf[i] > 0x7e) return false
  }
  return true
}

// The module/device table follows the length-prefixed vessel/configuration
// name. The table contains the actual CZone device/dipswitch addresses used
// by this configuration. Consumers can use these addresses to avoid selecting
// a command identity which collides with a real CZone device.
function parseModuleDeclarations (buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 20) return []

  const nameLength = buf[14]
  if (nameLength < 1 || nameLength > 120 || 15 + nameLength > buf.length) return []

  const tableStart = 15 + nameLength
  if (tableStart + 7 > buf.length) return []

  const tableLength = buf.readUInt32LE(tableStart)
  const deviceCount = buf[tableStart + 4]
  const recordsStart = tableStart + 7
  const recordsEnd = tableStart + 4 + tableLength

  if (deviceCount === 0 || recordsEnd > buf.length || recordsStart > recordsEnd) return []

  const modules = []
  const seen = new Set()
  let p = recordsStart

  for (let i = 0; i < deviceCount; i++) {
    if (p + 4 > recordsEnd) return []

    const module = buf[p]
    const type = buf[p + 1]
    const flags = buf[p + 2]
    const rawNameLength = buf[p + 3]
    const nameLength = rawNameLength & 0x7f
    const nameEnd = p + 4 + nameLength
    const recordEnd = nameEnd + 1

    if (nameLength < 1 || recordEnd > recordsEnd ||
      !isAsciiName(buf, p + 4, nameLength)) return []

    if (module !== 0 && !seen.has(module)) {
      modules.push({
        module,
        type,
        flags,
        name: buf.subarray(p + 4, nameEnd).toString('ascii'),
        offset: p,
        rawNameLength,
        trailing: buf[nameEnd]
      })
      seen.add(module)
    }

    p = recordEnd
  }

  if (p !== recordsEnd) return []
  return modules.sort((a, b) => a.module - b.module)
}

module.exports = { parseModuleDeclarations }
