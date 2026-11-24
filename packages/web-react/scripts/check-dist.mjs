// 构建后检查：dist 下只有 index.html；内嵌数据与 build.py data 深度相等；TJ_API_BASE 与环境变量 TIANJI_API_BASE 的规范化结果一致。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const buildPy = fileURLToPath(new URL('../../web/build.py', import.meta.url))

assert.deepEqual(readdirSync(dist), ['index.html'], 'dist 下必须只有 index.html')
const html = readFileSync(dist + 'index.html', 'utf8')
assert.ok(!/<script[^>]*\ssrc=/.test(html) && !/<link[^>]*rel="stylesheet"/.test(html), 'JS 与 CSS 必须全部内联')

const m = /<script id="tj-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
assert.ok(m, '没有找到 #tj-data')
const embedded = JSON.parse(m[1])

const expectedText = process.env.TJ_DATA
  ? readFileSync(process.env.TJ_DATA, 'utf8')
  : execFileSync(process.env.TJ_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-I', '-B', buildPy, 'data'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
assert.deepEqual(embedded, JSON.parse(expectedText), '内嵌数据与 build.py data 不相等')

const b = /window\.TJ_API_BASE=([^;]*);/.exec(html)
assert.ok(b, '没有找到 window.TJ_API_BASE')
const apiBase = vm.runInNewContext(b[1])
const expectedBase = (process.env.TIANJI_API_BASE ?? '').trim().replace(/\/+$/, '')
assert.equal(apiBase, expectedBase, 'TJ_API_BASE 与 TIANJI_API_BASE 不一致')

console.log(`dist 检查通过：index.html ${statSync(dist + 'index.html').size} 字节；entries ${embedded.entries.length}；TJ_API_BASE=${JSON.stringify(apiBase)}`)
