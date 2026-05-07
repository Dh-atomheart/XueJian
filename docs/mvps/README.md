# MVP 清晰入口

当前 MVP 路线：

```text
MVP-0 -> MVP-1 -> MVP-2 -> MVP-3
```

- [MVP-0](./mvp-0.md)：基础学习闭环。
- [MVP-1](./mvp-1.md)：AI 卡片生成与 BYOK。
- [MVP-2](./mvp-2.md)：PDF Reader 与学习体验增强。
- [MVP-3](./mvp-3.md)：RAG 知识问答 MVP。

MVP-3 的关键原则：必须 embedding、学习型问答、结构化回答、页面+相关内容引用、多文档支持、轻量多轮上下文，不做 FTS-only 正式回答。

# MVP 实施计划索引

本目录保存 XueJian 第一阶段的 MVP 实施 runbook。`docs/spec.md` 负责产品边界和阶段路线；本目录负责把阶段拆成可执行任务、数据与接口要求、测试计划和验收场景。

## 阶段依赖

```text
MVP-0 -> MVP-1 -> MVP-2
```

- [MVP-0：无 AI 的本地学习闭环](./mvp-0.md)
- [MVP-1：AI 卡片生成与 BYOK](./mvp-1.md)
- [MVP-2：PDF 阅读联动与学习统计体验](./mvp-2.md)

不得跳过 MVP-0 直接开发 MVP-1 或 MVP-2。AI 生成、Reader 联动和统计体验都依赖 MVP-0 产出的文档、卡片、分组、复习状态和学习事件。

## 执行原则

每个 MVP 按以下顺序实施：

```text
数据权威 -> Rust/Tauri IPC 与 gateway -> Python orchestration -> 前端页面 -> 测试验收
```

原则：

- 先让 Rust/SQLite 成为可测试的数据权威。
- 每个里程碑开始前先按 `docs/reuse-strategy.md` 审计现有资产，避免重复造轮子。
- 再暴露 Tauri commands、gateway 和 query 所需接口。
- Python 只执行解析或 AI workflow，不直接写 SQLite。
- 前端页面通过 gateway/query 层访问能力，不直接调用底层实现。
- 每个阶段结束时必须能跑通验收场景，再进入下一阶段。

## 工程契约依赖

MVP runbook 负责阶段范围和执行顺序，具体工程契约由以下文档承担：

- `docs/database-baseline.md`：数据库 V1 baseline、表结构、索引和迁移策略。
- `docs/ipc-api.md`：Tauri commands、前端 gateway、DTO 和错误模型。
- `docs/background-jobs.md`：后台任务状态机、取消、重试、恢复和错误语义。
- `docs/review-scheduler.md`：复习调度、四档反馈、每日队列和统计口径。
- `docs/ai-card-generation.md`：AI 卡片生成输入输出、来源校验和自动入库策略。

执行 MVP 时，若 runbook 与工程契约有冲突：

- 阶段范围以对应 `docs/mvps/*.md` 为准。
- 具体 schema、接口、任务语义和算法口径以工程契约文档为准。

## 统一文档结构

每个 MVP 文档包含：

- 目标。
- 完成定义。
- 不做什么。
- 依赖文档。
- 实施顺序。
- 数据与接口。
- 前端任务。
- Rust/Tauri 任务。
- Python orchestration 任务。
- 测试计划。
- 验收场景。
- 风险与回退。

## 冻结模块

以下模块不得作为任何 MVP 的实现任务：

- `knowledge`
- `podcast`
- `animation`
- `points`
- `export`
- `profile`

冻结表示隐藏入口、停止主线开发和延后审计，不代表立即删除历史代码。

## 权威关系

若文档之间出现冲突：

- 产品边界和阶段路线以 `docs/spec.md` 为准。
- 架构边界以 `docs/architecture.md` 为准。
- 模块内部流程以 `docs/modules/*.md` 为准。
- UI 细节以 `docs/ui.md` 为准。
- 现有资产复用策略以 `docs/reuse-strategy.md` 为准。
- 数据结构以 `docs/database-baseline.md` 为准。
- IPC 契约以 `docs/ipc-api.md` 为准。
- 长任务语义以 `docs/background-jobs.md` 为准。
- 复习调度以 `docs/review-scheduler.md` 为准。
- AI 卡片生成以 `docs/ai-card-generation.md` 为准。
- 当前阶段执行顺序和验收以对应 `docs/mvps/*.md` 为准。
