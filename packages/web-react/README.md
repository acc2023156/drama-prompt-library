# @tianji/web-react

天玑网站的 React 重构版（进行中）。产物是单个 `dist/index.html`，与旧页面（`packages/web`）并存，尚未切换发布源。

## 命令（仓库根目录执行）

| 命令 | 作用 |
|---|---|
| `npm run dev:web-react` | Vite 开发服务器（需要 `python3`，启动时调用 `build.py data`） |
| `npm run build:web-react` | 构建 `packages/web-react/dist/index.html` |
| `npm run test:web-react` | vitest（含旧页面对照测试） |
| `npm run typecheck:web-react` | `tsc --noEmit` |
| `npm run check:dist -w @tianji/web-react` | 构建后校验：只有 index.html、JS/CSS 内联、数据与 `build.py data` 深度相等、后端地址正确 |

## 数据与后端地址

- 内容数据：`plugins/tj-inject.ts` 在构建与 dev 时写进 `index.html` 的 `#tj-data`；数据来自 `python3 packages/web/build.py data`。环境变量 `TJ_DATA` 指向已生成的 JSON 文件时直接读取，`TJ_PYTHON` 可指定 Python 解释器。
- 后端地址：环境变量 `TIANJI_API_BASE`（与旧页面一致：去掉末尾斜杠，留空表示与网页同源），写进 `window.TJ_API_BASE`；代码里没有写死的地址。

## 旧实现对照

`tests/parity/legacy.ts` 用 acorn 从 `packages/web/site-template.html`（只读）抽出顶层函数与常量，在 `node:vm` 里运行，测试里新旧实现用同一组输入对照。冒烟测试见 `tests/parity/parse.test.ts`。
