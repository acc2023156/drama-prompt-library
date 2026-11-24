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

## 依赖约定

- `marked` 固定 12.0.2（不加 `^`），与旧页面 CDN 加载的 `marked@12.0.2` 同版本；CDN 文件与 npm 包内的 `marked.min.js` 字节相同。用法：`import { marked } from 'marked'`，调用 `marked.parse(md, { gfm: true, breaks: false })`，选项与旧 `renderMd` 一致。Markdown 组件（`src/components/Markdown.tsx`）由 P2-A 接入，接入前不 import 则不会进产物（Vite 会摇掉未引用的代码）。
- `index.html` 与旧页面一样从 Google Fonts 加载 Inter、Noto Sans SC（两行 `preconnect` 加一行样式表，原样取自旧模板），这是产物里仅有的外部样式请求。新增依赖只能由 P0 负责人合入 `package.json` 与根 `package-lock.json`。

## 测试约定

- 纯函数、对照、存储、请求层测试：文件名 `*.test.ts`，node 环境（vitest 项目 `node`）。
- 组件测试：文件名 `*.test.tsx`，jsdom 环境（vitest 项目 `dom`），`tests/setup-dom.ts` 已载入 `@testing-library/jest-dom` 匹配器并在每个用例后自动卸载组件。
- 工具：`@testing-library/react`（`render`、`screen`）、`@testing-library/user-event`（交互，先 `await userEvent.click(...)`）、`@testing-library/jest-dom`（`toBeInTheDocument` 等）。范例见 `tests/unit/not-implemented.test.tsx`。
- 单独运行：`npx vitest run --project node` 或 `--project dom`（在本包目录下）。需要 Node 22.22.2 以上（jsdom 31 的要求）。
- 组件里用到 `localStorage`、`location.hash` 时直接用 jsdom 提供的；每个用例自己清理（`localStorage.clear()`、`location.hash = ''`）。
