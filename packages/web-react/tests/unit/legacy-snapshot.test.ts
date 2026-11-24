import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEGACY_SNAPSHOT, LEGACY_SNAPSHOT_COMMIT, LEGACY_SNAPSHOT_SHA256 } from '../parity/legacy'

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

describe('旧模板快照守卫', () => {
  it(`快照文件存在，且与提交 ${LEGACY_SNAPSHOT_COMMIT} 的内容一致（sha256 与 README 记录相同）`, () => {
    const bytes = readFileSync(LEGACY_SNAPSHOT)
    expect(path.basename(LEGACY_SNAPSHOT)).toBe(`legacy-template.${LEGACY_SNAPSHOT_COMMIT}.html`)
    expect(sha256(bytes)).toBe(LEGACY_SNAPSHOT_SHA256)
    const readme = readFileSync(path.join(path.dirname(LEGACY_SNAPSHOT), 'README.md'), 'utf8')
    expect(readme).toContain(LEGACY_SNAPSHOT_SHA256)
    expect(readme).toContain(`\`${LEGACY_SNAPSHOT_COMMIT}\``)
  })
})
