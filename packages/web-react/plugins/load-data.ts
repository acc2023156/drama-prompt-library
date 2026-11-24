import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BUILD_PY = fileURLToPath(new URL('../../web/build.py', import.meta.url))

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
