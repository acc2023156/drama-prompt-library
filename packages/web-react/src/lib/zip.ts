/** 无依赖 ZIP 打包（store 方式，不压缩），同旧 makeZip / zipCrc：文件名 UTF-8 标志位 0x800，非 .json 文件正文前加 BOM。 */
export interface ZipFile {
  name: string
  text: string
}

export function zipCrc(bytes: Uint8Array): number {
  let c = -1
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
  }
  return (c ^ -1) >>> 0
}

const u16 = (n: number) => [n & 255, (n >>> 8) & 255]
const u32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]

/** 返回 ZIP 的各段字节（便于测试逐字节对照）；makeZip 把它们拼成 Blob。 */
export function zipParts(files: ZipFile[]): Uint8Array[] {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode((/\.json$/i.test(f.name) ? '' : '﻿') + f.text)
    const crc = zipCrc(data)
    const head = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name,
    ])
    parts.push(head, data)
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    ]))
    offset += head.length + data.length
  }
  const csize = central.reduce((n, x) => n + x.length, 0)
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(csize), ...u32(offset), ...u16(0),
  ])
  return [...parts, ...central, end]
}

export function makeZip(files: ZipFile[]): Blob {
  return new Blob(zipParts(files) as BlobPart[], { type: 'application/zip' })
}
