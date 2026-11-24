import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 不写 new URL('相对路径', import.meta.url)：vitest 的 jsdom 转换会改写它并替换全局 URL，.test.tsx 里 import 本文件会抛错
const BUILD_PY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/build.py')

/** 内容数据 JSON 文本：TJ_DATA 指向已生成的文件则直接读，否则调用 build.py data 现生成（TJ_PYTHON 可指定解释器）。 */
export function loadDataJson(env: NodeJS.ProcessEnv = process.env): string {
  const file = env.TJ_DATA
  const text = file
    ? readFileSync(file, 'utf8')
    : execFileSync(env.TJ_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-I', '-B', BUILD_PY, 'data'], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      })
  JSON.parse(text)
  return text
}
