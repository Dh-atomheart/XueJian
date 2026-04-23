# XueJian 卡片系统评估框架

> 版本：2.0.0  
> 最后更新：2026-04-23  
> 文档角色：卡片系统验收与整改框架  
> 当前结论：门禁未通过，以 `xuejian/test-results/eval-report.json` 为当前真实基线

---

## 1. 目的与适用范围

本文档只做三件事：

1. 将 `docs/card-system-v2.md` 转换为可执行验收项。
2. 将当前失败项收敛为整改台账。
3. 给出卡片系统当前是否通过门禁的真实结论。

本文档不是历史庆功文档，也不是产品行为主规范。卡片系统行为、主线、页面职责、状态机、完成定义均由 `docs/card-system-v2.md` 定义。

本文档适用于以下范围：

- `xuejian/src/features/cards/`
- `xuejian/src/features/review/`
- `xuejian/src/components/cards/`
- `xuejian/src/queries/`
- `xuejian/src/services/`
- `xuejian/src/store/`
- `xuejian/src/types/`
- `xuejian/src-tauri/src/commands/`
- `xuejian/src-tauri/src/db/`
- `xuejian/src-tauri/src/migrations/`
- `xuejian/orchestration_service/`
- `xuejian/tests/`
- `xuejian/scripts/eval/`

---

## 2. 与主规范的关系

### 2.1 权威关系

- `docs/card-system-v2.md`：卡片系统唯一开发规范
- 本文档：卡片系统验收与整改框架
- `docs/agent-driven-document-to-card-workflow.md`：候选生成链路专题补充

### 2.2 冲突处理规则

- 若评估项与主规范冲突，以主规范为准，并先修订本文档。
- 若脚本行为与本文档冲突，以本文档为目标口径修订脚本。
- 若历史运行记录与当前基线冲突，以当前基线为准，历史记录仅保留为历史事实。

### 2.3 评估基线优先级

当前评估使用以下优先级：

1. `docs/card-system-v2.md`
2. `xuejian/test-results/eval-report.json`
3. 仓库当前代码与测试行为
4. 本文档中的历史运行记录

---

## 3. 当前基线快照

当前基线来自 2026-04-23 执行 `npm run eval:cards` 生成的报告。

### 3.1 当前门禁结论

- `deliveryGatePassed = false`
- `phase0to5Average = 9.4`
- `branch = master`
- `hasUncommittedChanges = true`

### 3.2 当前检查结果

| 检查项 | 当前状态 | 备注 |
| --- | --- | --- |
| Structure | failed | 15/17，通过率受脚本漂移影响 |
| Frontend Build | passed | `tsconfig.card-eval.json` 通过 |
| Rust Check | passed | `cargo check` 通过，存在 warnings |
| Vitest | passed | 11 个目标文件，36 个测试通过 |
| Cargo Test | failed | 1 个 Rust 测试失败 |
| Playwright | failed | 4 条场景失败 |

### 3.3 当前分数

| 分项 | 当前分数 |
| --- | --- |
| Phase 0 | 8.5 |
| Phase 1 | 10 |
| Phase 2 | 10 |
| Phase 3 | 10 |
| Phase 4 | 8 |
| Phase 5 | 10 |
| Cross Architecture | 8 |
| Cross IPC | 10 |
| Cross Engineering | 6.5 |

### 3.4 当前阻塞项摘要

当前门禁失败至少由以下三类因素触发：

1. 真实实现缺陷
2. 评估脚本漂移
3. E2E 契约漂移

---

## 4. 门禁定义

### 4.1 Gating 条件

当前卡片系统只有在以下条件全部满足时，才算通过门禁：

1. `deliveryGatePassed = true`
2. `check-structure.mjs` 不包含阻塞级失败项
3. `check-types.mjs` 全部通过
4. `check-tests.mjs` 中 card-system gating tests 全部通过
5. `check-e2e.mjs` 中当前 UI 对应的 card-system gating 场景全部通过
6. 本文档“当前失败项与归因”中不存在未关闭的阻塞级问题

### 4.2 非阻塞观察项

以下内容可以作为观察项，不自动等同于门禁失败，除非被升级：

- 非卡片系统范围的仓库健康警告
- pre-existing dead code warnings
- 不影响当前卡片主线的历史遗留问题
- 仅影响统计质量、不影响正确性的日志问题

### 4.3 禁止掩盖失败

以下做法不允许：

- 用高平均分掩盖 gating failure
- 用历史成功快照覆盖当前失败
- 通过弱化脚本检查来“制造通过”
- 把脚本误报和真实缺陷混为一类

---

## 5. 评估执行流程

标准执行流程如下：

1. 读取主规范，确认当前主线与页面职责。
2. 运行结构检查。
3. 运行类型检查。
4. 运行 targeted tests。
5. 运行 card-system E2E。
6. 生成报告。
7. 将失败项分类为真实缺陷、脚本漂移、文档漂移。
8. 按修复优先级整改并复跑。

### 5.1 脚本职责

| 脚本 | 当前职责 |
| --- | --- |
| `xuejian/scripts/eval/check-structure.mjs` | 检查文件、导出、关键契约存在性 |
| `xuejian/scripts/eval/check-types.mjs` | 检查 TypeScript 和 Rust 基础构建 |
| `xuejian/scripts/eval/check-tests.mjs` | 执行 targeted Vitest 与 Rust tests |
| `xuejian/scripts/eval/check-e2e.mjs` | 执行 card-system 场景的 Playwright 验证 |
| `xuejian/scripts/eval/run-eval.mjs` | 汇总结果并生成报告 |

### 5.2 报告输出

当前必须生成：

- `xuejian/test-results/eval-report.json`
- `xuejian/test-results/eval-report.md`

后续报告应补充以下结构化字段：

- `gatingFailures`
- `scriptDriftFindings`
- `repoHealthWarnings`
- `baselineMode`

---

## 6. 评估矩阵

本节只保留当前主规范要求的核心矩阵，不再把 P6-P9 路线图内容混入核心门禁。

### 6.1 P0 输入就绪与候选生成前置条件

| ID | 验收项 | 通过定义 | 当前状态 |
| --- | --- | --- | --- |
| P0-01 | 文档可进入候选生成前置状态 | `ready` 状态链路存在且可被消费 | In Review |
| P0-02 | `CardStudioPage` 面向就绪文档启动候选生成 | 页面职责与主规范一致 | Failed |
| P0-03 | 候选链路可记录 workflow 事件与检查点 | 工作流元数据可查询 | In Review |

### 6.2 P1 候选生成与工作流恢复

| ID | 验收项 | 通过定义 | 当前状态 |
| --- | --- | --- | --- |
| P1-01 | 候选生成命令与契约存在 | gateway / command / schema 对齐 | Passed |
| P1-02 | 候选批次可恢复 | checkpoint 与 resume 能力存在 | In Review |
| P1-03 | AI 生成契约覆盖 `qa/cloze/fact/choice` | schema 与 prompt 对齐 | Passed |

### 6.3 P2 候选审核与人工确认

| ID | 验收项 | 通过定义 | 当前状态 |
| --- | --- | --- | --- |
| P2-01 | 候选可接受、拒绝和批量处理 | UI + gateway + persistence 闭环存在 | In Review |
| P2-02 | 候选可编辑 | 编辑路径与持久化路径一致 | In Review |
| P2-03 | `CardStudioPage` 与测试口径一致 | 结构检查与单测不依赖旧页面叙事 | Failed |

### 6.4 P3 正式卡片模型、落库与编辑

| ID | 验收项 | 通过定义 | 当前状态 |
| --- | --- | --- | --- |
| P3-01 | `cards` 契约与 DTO/Zod 对齐 | 无字段漂移 | Passed |
| P3-02 | accepted candidates 可物化为 `cards` | 最终入库路径存在 | In Review |
| P3-03 | `CardEditorModal` 支持正式卡片字段编辑 | front/back/tags/type 基础能力可用 | Passed |

### 6.5 P4 复习渲染与 FSRS 调度

| ID | 验收项 | 通过定义 | 当前状态 |
| --- | --- | --- | --- |
| P4-01 | `ReviewPage` 读取 due cards | 会话由真实数据驱动 | Passed |
| P4-02 | `qa/cloze/fact/choice/image_occlusion` 路由正确 | 类型渲染符合主规范 | Passed |
| P4-03 | 评分写回调度和复习日志 | 调度字段与日志链路完整 | In Review |
| P4-04 | Review E2E 场景通过 | 当前 UI 契约下的 happy-path 可通过 | Failed |

### 6.6 P5 媒体、导入导出与增强能力

| ID | 验收项 | 通过定义 | 当前状态 |
| --- | --- | --- | --- |
| P5-01 | `card_media` 迁移与命令存在 | upload/list/delete 结构可见 | Passed |
| P5-02 | APKG 导入导出链路存在 | import/export 命令与脚本存在 | Passed |
| P5-03 | 增强能力与 UI 契约一致 | 文档、脚本、UI 口径一致 | In Review |

---

## 7. 当前失败项与归因

本节只记录当前真实基线下的失败项，并明确分类。

### 7.1 真实实现缺陷

1. `cargo test` 失败  
   - 用例：`db::card_repo::tests::highlight_crud_roundtrip`  
   - 现象：`table highlights has no column named note`  
   - 归因：数据库 schema / repository / test 之间存在真实不一致  
   - 影响：阻塞 gating

### 7.2 评估脚本漂移

1. `check-structure.mjs` 仍使用旧的 `CardStudioPage` 编辑流模式检查  
   - 失败项：`card-studio-edit-flow`
   - 归因：脚本仍假定 `CardStudioPage` 是正式卡片编辑页
   - 影响：造成结构检查误报，阻塞 gating

2. `check-structure.mjs` 仍依赖旧测试标题  
   - 失败项：`unit-test-card-studio`
   - 归因：脚本检查 `creates a card through the editor modal`，但当前测试文件已改写
   - 影响：造成结构检查误报，阻塞 gating

### 7.3 E2E 契约漂移

1. Playwright 4 条场景全部失败  
   - 现象：`card-studio-page`、`library-page` 等 testid 不匹配，`ReviewPage` 文案契约也与测试不一致
   - 归因：测试脚本与当前 UI 契约失配
   - 影响：阻塞 gating

### 7.4 文档漂移

1. 旧版 `docs/card-system-v2.md` 曾将 `CardStudioPage` 错误描述为正式卡片列表页。
2. 旧版评估框架曾保留“Status: All Clear”和“最终通过”叙事，不再符合当前状态。

---

## 8. 修复工作流

每个失败项统一按以下生命周期处理：

1. 重现
2. 归因
3. 分类
4. 最小正确修复
5. 补充或更新测试
6. 复跑受影响评估片段
7. 更新本文档中的当前状态

### 8.1 当前优先级

当前建议优先级如下：

1. 修复真实实现缺陷：`highlight_crud_roundtrip`
2. 修复评估脚本漂移：结构检查与测试标题依赖
3. 修复 E2E 契约漂移：当前 UI 对应的 testid / 场景
4. 扩展报告字段：将 gating failures 与脚本漂移显式分离

### 8.2 脚本修订要求

后续脚本整改必须满足以下规则：

- `check-structure.mjs`
  - 只检查当前主规范要求的能力
  - 不再依赖旧页面职责
  - 避免脆弱字符串匹配，优先使用文件、导出、testid、命令名、schema 值
- `check-tests.mjs`
  - 区分 card-system gating tests 与 repo-wide health tests
  - 真实 Rust 缺陷必须独立呈现，不被总分掩盖
- `check-e2e.mjs`
  - 场景必须以当前 UI 契约为准
  - 页面级 `data-testid` 若变动，必须同步脚本与主规范
- `run-eval.mjs`
  - 报告需要显式输出 gating failures、script drift、repo health warnings

---

## 9. 历史运行记录

本节只记录历史事实，不代表当前状态。

### 9.1 2026-04-21 历史快照

仓库曾在 2026-04-21 形成一版“最终通过”的评估叙事，核心内容包括：

- 曾声明 `deliveryGatePassed: true`
- 曾宣称结构检查、Vitest、Rust tests、Playwright 全绿
- 曾将其写入旧版评估框架的“Final Verified State”

该历史快照仅可视为一次历史记录，不能替代当前基线。

### 9.2 当前与历史的区别

截至 2026-04-23：

- 当前报告已重新生成
- 当前门禁结论为失败
- 当前整改框架以最新报告为准

因此，任何引用历史成功快照的表述都必须显式带日期，且不能写成当前结论。

