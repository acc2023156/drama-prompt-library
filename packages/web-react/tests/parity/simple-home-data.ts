import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/*
 * 标准版首页对照的数据与路径。不 import src 下任何模块，供 vi.mock('src/data') 的工厂函数使用；
 * 也不用 new URL(…, import.meta.url)，jsdom 环境下全局 URL 被替换会抛错。
 */
const PKG_WEB = path.resolve(import.meta.dirname, '../../../web')
export const LEGACY_TEMPLATE = path.join(PKG_WEB, 'site-template.html')

let cache: any
/** build.py data 的内容（对象），整个测试进程只生成一次；TJ_DATA 指向已生成文件时直接读。 */
export function loadData(): any {
  if (cache) return cache
  const f = process.env.TJ_DATA
  const text = f ? readFileSync(f, 'utf8') : execFileSync('python3', ['-I', '-B', path.join(PKG_WEB, 'build.py'), 'data'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return (cache = JSON.parse(text))
}
