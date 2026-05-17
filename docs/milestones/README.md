# Milestones 清晰入口

当前里程碑路线：

```text
M01-M06 -> MVP-0
M07-M09 -> MVP-1
M10-M11 -> MVP-2
M12-M14 -> MVP-3 / RAG 知识问答
UI-01-UI-04 -> MVP UI 改造
UI-05 -> V1 / MVP-3 RAG UI
```

RAG 相关里程碑：

- [M12：RAG Foundation](./m12-rag-foundation.md)
- [M13：RAG Retrieval Quality](./m13-rag-retrieval-quality.md)
- [M14：RAG UI Polish](./m14-rag-ui-polish.md)

RAG 验收入口：[RAG 验收测试](../rag/legacy/rag-acceptance-tests.md)。

UI 改造相关里程碑：

- [UI-01：Shell 与可见文案基线](./ui-01-shell-visible-text-baseline.md)
- [UI-02：Light / Dark / System 主题基础设施](./ui-02-theme-foundation.md)
- [UI-03：共享组件与状态表达收敛](./ui-03-shared-components-and-states.md)
- [UI-04：MVP 学习闭环页面打磨](./ui-04-mvp-learning-loop-polish.md)
- [UI-05：Knowledge / RAG V1 页面](./ui-05-knowledge-rag-v1-page.md)

# 里程碑执行计划

本目录是 XueJian 的开发执行层文档。`docs/mvps/*.md` 定义阶段 runbook，本目录把 MVP-0/1/2/3 拆成可交付、可验收、可暂停的纵向里程碑。

UI-01 到 UI-05 是依据 `docs/ui.md` 和 `docs/学习工作台_交互界面设计规范_v1.0.md` 形成的横向 UI 改造路线。它们不替代 M01-M14，而是在主线能力具备后用于收敛视觉、交互、状态和 RAG 页面体验。

## 依赖顺序

```text
M01 -> M02 -> M03 -> M04 -> M05 -> M06
                         -> MVP-0 gate
M07 -> M08 -> M09
              -> MVP-1 gate
M10 -> M11
       -> 第一阶段体验 gate
UI-01 -> UI-02 -> UI-03 -> UI-04
                         -> MVP UI gate
UI-05
  -> V1 / MVP-3 RAG UI gate
```

阶段归属：

- MVP-0：M01-M06。
- MVP-1：M07-M09。
- MVP-2：M10-M11。
- MVP-3 / RAG：M12-M14。
- MVP UI 改造：UI-01-UI-04。
- V1 / MVP-3 RAG UI：UI-05。

## 执行规则

- 采用纵向闭环优先。每个里程碑都应尽量产出可运行功能，而不是只完成单层技术铺垫。
- 每个里程碑开始前必须按 `docs/reuse-strategy.md` 做资产审计，明确现有代码属于 `reuse_direct / reuse_adapt / freeze_reference / replace` 中哪一类。
- 每个里程碑完成门槛是“可运行 + 至少关键测试”。
- 不得跳过 gate：M06 完成后才能进入 MVP-1，M09 完成后才能进入 MVP-2。
- 后续如果某个里程碑过大，可以在该文档内继续拆任务，但不改变 gate。

## 工作量标记

- `S`：1-2 天级。
- `M`：2-5 天级。
- `L`：5 天以上，或跨多层风险较高。

## 冻结模块

以下模块不得进入任何里程碑的实现范围：

- `knowledge`
- `podcast`
- `animation`
- `points`
- `export`
- `profile`

冻结表示隐藏入口、停止主线开发和延后审计，不代表必须立即删除历史代码。

例外：UI-05 可以在 M12/M13 完成且产品路线允许时打磨 `knowledge` 页面。若 `spec.md` 尚未同步 `knowledge` 主导航，UI-05 的入口必须按 `Proposal` 管理，不得作为正式主导航验收项。

## 工程契约引用

里程碑执行时，以下专项文档是具体实现依据：

- M02：`docs/database-baseline.md`。
- M03：`docs/ipc-api.md`、`docs/background-jobs.md`。
- M05：`docs/review-scheduler.md`。
- M07：`docs/ipc-api.md`。
- M08：`docs/ai-card-generation.md`、`docs/background-jobs.md`。
- M09：`docs/ai-card-generation.md`、`docs/background-jobs.md`、`docs/ipc-api.md`。
- UI-01-UI-05：`docs/ui.md`、`docs/学习工作台_交互界面设计规范_v1.0.md`。
- UI-05：`docs/rag/legacy/rag-knowledge-qa.md`、`docs/rag/legacy/rag-acceptance-tests.md`、`docs/milestones/m14-rag-ui-polish.md`。

这些文档不改变里程碑范围，只负责锁定 schema、接口、状态机、调度和 AI 生成契约。

## 里程碑索引

- [M01：范围收敛与 AppShell 基线](./m01-scope-and-shell.md)
- [M02：V1 数据基线与 Rust 数据权威](./m02-data-baseline.md)
- [M03：PDF 导入与解析闭环](./m03-documents-import-parse.md)
- [M04：Basic 卡片与分组管理](./m04-cards-groups.md)
- [M05：每日复习闭环](./m05-study-loop.md)
- [M06：MVP-0 加固与验收](./m06-mvp0-hardening.md)
- [M07：Provider 与 BYOK](./m07-provider-byok.md)
- [M08：AI 卡片生成 workflow](./m08-ai-card-generation.md)
- [M09：AI 生成 UI 与 MVP-1 验收](./m09-ai-generation-ui.md)
- [M10：PDF Reader 与当前页卡片联动](./m10-reader-linking.md)
- [M11：学习仪表盘与体验打磨](./m11-dashboard-and-polish.md)
- [M12：RAG Foundation](./m12-rag-foundation.md)
- [M13：RAG Retrieval Quality](./m13-rag-retrieval-quality.md)
- [M14：RAG UI Polish](./m14-rag-ui-polish.md)
- [UI-01：Shell 与可见文案基线](./ui-01-shell-visible-text-baseline.md)
- [UI-02：Light / Dark / System 主题基础设施](./ui-02-theme-foundation.md)
- [UI-03：共享组件与状态表达收敛](./ui-03-shared-components-and-states.md)
- [UI-04：MVP 学习闭环页面打磨](./ui-04-mvp-learning-loop-polish.md)
- [UI-05：Knowledge / RAG V1 页面](./ui-05-knowledge-rag-v1-page.md)

## 权威关系

- 产品边界和阶段路线以 `docs/spec.md` 为准。
- 架构边界以 `docs/architecture.md` 为准。
- 模块流程以 `docs/modules/*.md` 为准。
- UI 细节以 `docs/ui.md` 为准。
- UI 详细页面、组件、状态和主题以 `docs/学习工作台_交互界面设计规范_v1.0.md` 为补充；与 `docs/ui.md` 或 `docs/spec.md` 冲突时以后者为准。
- 现有资产复用、适配、冻结和替换规则以 `docs/reuse-strategy.md` 为准。
- MVP 阶段范围以 `docs/mvps/*.md` 为准。
- 工程契约以 `docs/database-baseline.md`、`docs/ipc-api.md`、`docs/background-jobs.md`、`docs/review-scheduler.md` 和 `docs/ai-card-generation.md` 为准。
- 具体里程碑任务分配和完成门槛以本目录文档为准。
