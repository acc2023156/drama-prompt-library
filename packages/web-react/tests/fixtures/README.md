# tests/fixtures

## legacy-template.1cf6f6c.html

旧页面模板 `packages/web/site-template.html` 在提交 `1cf6f6c` 时的完整内容，由 `git show 1cf6f6c:packages/web/site-template.html` 原样生成，不手改。

| 项 | 值 |
|---|---|
| 提交 | `1cf6f6c` |
| 大小 | 329,328 字节 |
| sha256 | `e023143e29b88c0c07f7d225e604f8ce2e88ca84deb89e3325133e242fdf524e` |

### 为什么固定

新旧对照测试以旧模板为基准。模板由布莱德每天修改，基准随之漂移：`f331924`（我的资产删除加回收站，新增存储键 `assetsTrash` 与路由 `#/assets-trash`）一合入，`lib.test.ts` 的“覆盖全部 18 个键”与 `shell.test.ts` 的“模板里全部字面量站内链接”就失败，而这两处实现的范围（M03 资产库）还没迁移。

P1 到 P3 的 6 个任务包都是对着 `1cf6f6c` 实现并验证的，所以对照基准固定在它；`f331924` 之后的改动由 P6-A 追平。

### 谁在读它

只有 `tests/parity/legacy.ts` 读模板（导出 `LEGACY_TEMPLATE`、`readLegacyTemplate()`、`legacyScript()`、`legacyTopLevel()`），其余对照辅助文件都从那里取。`tests/unit/legacy-snapshot.test.ts` 守卫快照存在且 sha256 与上表一致。

### 对照最新模板（仅 P6-A 追平阶段用，默认不开）

```bash
LEGACY_TEMPLATE=latest npm run test -w @tianji/web-react
```

`latest` 读仓库里当前的 `packages/web/site-template.html`（只读）；其他取值会报错。会失败的用例就是尚未追平的差异。

### 如何更新快照（P6 追平时）

1. 用 `LEGACY_TEMPLATE=latest` 跑全部测试，列出失败用例，逐项处理（迁移改动，或确认为不迁移并记录）。
2. `git show <新提交>:packages/web/site-template.html > tests/fixtures/legacy-template.<新提交>.html`，删除旧快照。
3. 同步改 `tests/parity/legacy.ts` 里的 `LEGACY_SNAPSHOT_COMMIT`、`LEGACY_SNAPSHOT_SHA256`、`LEGACY_SNAPSHOT` 文件名，以及本文件的提交、大小、sha256。
4. 全包测试必须全绿后才能提交。
