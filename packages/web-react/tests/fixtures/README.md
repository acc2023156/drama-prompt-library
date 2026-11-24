# tests/fixtures

## legacy-template.f331924.html

旧页面模板 `packages/web/site-template.html` 在提交 `f331924` 时的完整内容，由 `git show f331924:packages/web/site-template.html` 原样生成，不手改。

| 项 | 值 |
|---|---|
| 提交 | `f331924` |
| 大小 | 332,119 字节 |
| sha256 | `21bd18c2279791fe699882be76a22aad9d0e91589dcf6f70f4a5f9c686ec6500` |

### 为什么固定

新旧对照测试以旧模板为基准。模板由布莱德每天修改，基准若随之漂移，他的每次提交都会让对照测试失败，而对应模块未必已经迁移。所以基准固定在一个已全部追平的提交，新提交由追平任务成批处理。

### 历史

| 快照 | 说明 |
|---|---|
| `1cf6f6c` | P1 到 P3 的 6 个任务包对着它实现并验证 |
| `f331924` | P6-A 追平：资产回收站（存储键 `assetsTrash`、路由 `#/assets-trash`），作品页与资产页的多选抽成共用 `pickMode` |

旧快照只留在 git 历史里，`git show <提交>:packages/web/site-template.html` 随时可以还原。

### 谁在读它

只有 `tests/parity/legacy.ts` 读模板（导出 `LEGACY_TEMPLATE`、`readLegacyTemplate()`、`legacyScript()`、`legacyTopLevel()`），其余对照辅助文件都从那里取。`tests/unit/legacy-snapshot.test.ts` 守卫快照存在且 sha256 与上表一致。

### 对照最新模板（追平时用，默认不开）

```bash
LEGACY_TEMPLATE=latest npm run test -w @tianji/web-react
```

`latest` 读仓库里当前的 `packages/web/site-template.html`（只读）；其他取值会报错。会失败的用例就是尚未追平的差异。

### 追平 SOP（每次追平照做）

1. 定范围：`git fetch origin`，`git log --oneline <当前快照提交>..origin/main -- packages/web/site-template.html` 列出新提交；只追平到开工时的最新提交 `<新提交>`，之后的留给下一次。
2. 列差异：`git diff <当前快照提交> <新提交> -- packages/web/site-template.html`，按函数名逐块判断所属模块，记下每块的结论（已移植 / 不迁移及原因）。
3. 跑基线：`LEGACY_TEMPLATE=latest` 跑全包测试，失败用例就是差异清单。逐项处理：迁移实现；旧行为已从模板删除的用例，改写成对应新行为的用例。不放宽、不删除断言。
4. 换快照：`git show <新提交>:packages/web/site-template.html > tests/fixtures/legacy-template.<新提交>.html`，`git rm` 旧快照；`shasum -a 256` 与 `wc -c` 取 sha256 和大小。
5. 同步记录：`tests/parity/legacy.ts` 的 `LEGACY_SNAPSHOT_COMMIT`、`LEGACY_SNAPSHOT_SHA256`、`LEGACY_SNAPSHOT` 文件名；本文件的标题、上表与历史表；包 README 里提到快照的一行。
6. 验收：默认（固定新快照）与 `LEGACY_TEMPLATE=latest` 两种方式全包测试都 0 失败（此时两者读的是同一份内容）；`npm run typecheck:web-react` 通过。
