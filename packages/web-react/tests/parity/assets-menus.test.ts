import { beforeAll, describe, expect, it } from 'vitest'
import { ASSET_FN, ASSET_NAV } from '../../src/app/nav-data'
import { G, styleList } from '../../src/domain/styles'
import { makeById } from '../../src/domain/library'
import { ASSET_MENUS, FN } from '../../src/features/assets/menus'
import { buildAssetPrompt } from '../../src/features/assets/prompt'
import { fnOf } from '../../src/features/assets/seed'
import { ASSET_DESC } from '../../src/features/prompts/func-index'
import { loadData } from './data'
import { type Legacy, loadLegacy } from './legacy'

/** 资产库常量与旧页面逐字段相等：ASSET_MENUS、FN、G；侧栏目录（nav-data）与搜索说明（func-index）取自同一份菜单。 */

let legacy: Legacy
beforeAll(() => {
  legacy = loadLegacy({ data: loadData() })
})

describe('菜单常量', () => {
  it('ASSET_MENUS 与旧页面相等（文案、模板、预览、选项）', () => {
    expect(ASSET_MENUS).toStrictEqual(legacy.run('ASSET_MENUS'))
  })
  it('FN 与旧页面相等（每项带所属菜单）', () => {
    expect(JSON.parse(JSON.stringify(FN))).toStrictEqual(legacy.run('FN'))
    expect(Object.keys(FN)).toStrictEqual(legacy.run('Object.keys(FN)'))
  })
  it('渐变色 G 与旧页面相等', () => {
    expect(G).toStrictEqual(legacy.run('G'))
  })
  it('侧栏目录 ASSET_NAV / ASSET_FN 与完整菜单的 id、标题、图标、文字一致', () => {
    expect(ASSET_NAV).toStrictEqual(ASSET_MENUS.map((m) => ({ key: m.key, title: m.title, items: m.items.map((i) => ({ id: i.id, icon: i.icon, label: i.label })) })))
    expect(ASSET_FN).toStrictEqual(Object.fromEntries(Object.entries(FN).map(([id, f]) => [id, { label: f.label, menu: f.menu.key }])))
  })
  it('搜索用的功能说明 ASSET_DESC 与旧 ASSET_MENUS 的 desc 相等', () => {
    expect(ASSET_DESC).toStrictEqual(legacy.run('Object.fromEntries(ASSET_MENUS.flatMap(m=>m.items.map(i=>[i.id,i.desc])))'))
  })
  it('fnOf 只认菜单里的 id，不命中原型键', () => {
    expect(fnOf('role-board')).toBe(FN['role-board'])
    for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '']) expect(fnOf(k)).toBeUndefined()
  })
})

describe('提示词拼装与旧 build 相等', () => {
  const data = loadData()
  const styles = styleList(data.core.styles, makeById<{ id: string; body: string }>(data.entries), '  我的画风 ')
  // 旧 build 是 viewAssetEditor 的闭包；这里按其源码在旧页面作用域里复刻一份，用同一份 styleList 结果比较
  const legacyBuild = (fn: string, st: unknown) =>
    legacy.run<string>(`(()=>{const f=FN[${JSON.stringify(fn)}], st=${JSON.stringify(st)}, styles=${JSON.stringify(styles)};
      let t=f.tpl.replace('{name}', st.name||f.name).replace('{profile}', st.profile||'（未填写）').replace('{opts}', st.opts.join('、')||'（未选择）');
      const s=styles.find(x=>x.n===st.style);
      if(s&&s.t) t+='\\n风格：'+s.t;
      if((st.extra||'').trim()) t+='\\n补充：'+st.extra.trim();
      t+=\`\\n画面比例 \${st.ratio}，\${st.res} 分辨率。\`;
      return t})()`)
  const STATES = [
    { name: '', profile: '', extra: '', style: '无', ratio: '16:9', res: '2K', opts: [] },
    { name: '林$&骁', profile: '{opts}$1', extra: '  补一句  ', style: '我的自定义', ratio: '9:16', res: '4K', opts: ['夜晚', '白天'] },
    { name: '{profile}', profile: '冷面', extra: '   ', style: '不存在', ratio: '1:1', res: '1K', opts: ['全景'] },
    { name: 'A', style: '2D 动漫', ratio: '4:3', res: '2K', opts: [] },
  ]
  for (const fn of Object.keys(FN))
    it(fn, () => {
      for (const st of STATES) expect(buildAssetPrompt(FN[fn], st, styles)).toBe(legacyBuild(fn, st))
    })
  it('复刻的旧 build 与模板里的源码一致（防止复刻走样）', () => {
    const src = legacy.run<string>('viewAssetEditor.toString()')
    for (const line of [
      "let t=f.tpl.replace('{name}', st.name||f.name).replace('{profile}', st.profile||'（未填写）').replace('{opts}', st.opts.join('、')||'（未选择）');",
      'const s=styles.find(x=>x.n===st.style);',
      "if(s&&s.t) t+='\\n风格：'+s.t;",
      "if((st.extra||'').trim()) t+='\\n补充：'+st.extra.trim();",
      't+=`\\n画面比例 ${st.ratio}，${st.res} 分辨率。`;',
    ])
      expect(src).toContain(line)
  })
})
