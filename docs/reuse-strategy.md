# 现有资产复用策略

本文档定义 XueJian 在里程碑开发中的现有代码复用规则。它不替代 `docs/milestones/*.md` 的交付顺序，也不替代工程契约文档；它负责回答：面对已经存在的实现，什么时候直接复用、什么时候适配、什么时候冻结、什么时候重写。

## 总原则

后续开发采用：

```text
契约优先 -> 资产审计 -> 复用或适配 -> 冻结隔离 -> 里程碑验收
```

- `docs/milestones/*.md` 决定开发顺序和完成门槛。
- `docs/database-baseline.md`、`docs/ipc-api.md`、`docs/background-jobs.md`、`docs/review-scheduler.md`、`docs/ai-card-generation.md` 决定新实现契约。
- 现有代码只要符合新契约，就优先复用。
- 不符合但有价值的代码，通过 adapter、repository、gateway 或 facade 适配后复用。
- 超出 MVP 的历史模块冻结，不删除、不继续扩展、不进入主导航。

## 资产审计规则

每个 milestone 开始前先做 30-60 分钟资产审计，不直接开写代码。

审计问题：

- 当前是否已有相同或相近能力。
- 现有实现是否符合当前 `docs/` 契约。
- 是否依赖冻结模块。
- 是否能通过小范围 adapter 接入。
- 复用成本是否低于按新契约重写。

审计结果必须归为四类之一：

```text
reuse_direct      直接复用
reuse_adapt       包一层或小改后复用
freeze_reference  冻结为参考，不进主线
replace           不复用，按新契约重写
```

建议在 milestone 开发记录或 PR 描述中保留简短审计结论。

## 可优先复用的资产

以下资产优先复用，但最终行为必须符合当前 `docs/` 新契约：

- Tauri app shell 和启动基础。
- Rust SQLite 初始化、连接管理、refinery 迁移基础。
- Stronghold 密钥保存和恢复逻辑。
- Rust host gateway / Python orchestration 启动机制。
- Python Provider runtime、LiteLLM adapter、Pydantic schema 基础。
- PyMuPDF / Docling 相关解析能力。
- 前端 gateway/query 组织方式。
- Vitest / Playwright 测试框架。
- UI primitives、设计 token、Sketch/roughjs 点缀组件。

## 需要适配后复用的资产

### 旧 `src/services/gateway/*`

可复用：

- gateway 分层思路。
- 前端请求聚合方式。
- 测试结构。

必须适配：

- 接口形状对齐 `docs/ipc-api.md`。
- DTO 不直接继承旧 mock 数据结构。
- mock data 不能作为 MVP 验收依据。

### 旧 Rust `commands/*`

可复用：

- command 注册方式。
- 错误处理模式。
- 部分 DTO 和输入校验写法。

必须适配：

- commands 必须按 MVP 主线收敛。
- 冻结模块 command 不进入主导航和新验收。
- 返回错误必须对齐 `docs/ipc-api.md` 的 `AppError`。

### 旧 `db/*_repo.rs`

可复用：

- rusqlite 操作模式。
- repository 测试写法。
- 事务和查询组织方式。

必须适配：

- schema 对齐 `docs/database-baseline.md`。
- 旧 migrations 只作为参考，不作为兼容约束。
- 冻结模块相关表不进入新 V1 baseline。

### Python `workflows/card_generation.py`

可复用：

- prompt 组织经验。
- Provider 调用和结构化输出处理思路。
- 卡片生成 workflow 的阶段拆分。

必须适配：

- 输出对齐 `docs/ai-card-generation.md`。
- 不沿用候选表、复杂 agent 或超前 workflow 作为 MVP 主线。
- Python 不直接写 SQLite。
- 结果必须由 Rust 校验并入库。

## 必须冻结的资产

以下模块可以保留代码，但不得进入 MVP 开发路线；`knowledge` 已按 UI-05 / V1.1 路线解冻为学习型 RAG 页面：

```text
podcast
animation
points
export
profile
```

处理方式：

- M01 隐藏入口。
- 后续 milestone 不新增这些模块的功能。
- 测试中若旧模块阻碍主线，可以跳过、隔离或后续清理。
- 不在 M01-M11 中主动删除，避免引入大规模回归。

冻结不是删除。删除、迁移和大规模清理应在 MVP-0 gate 后另行规划。

## 里程碑复用指引

### M01：Scope And Shell

优先复用：

- 现有 App shell。
- 现有导航布局。
- 现有 UI primitives。
- 现有路由结构。

需要收敛：

- 隐藏冻结入口。
- MVP 主导航只保留：首页 / 文档 / 卡片 / 学习 / 设置；V1.1 可扩展为：首页 / 文档 / 卡片 / 学习 / 知识 / 设置。
- 保留旧页面代码，但不作为入口暴露。

### M02：Data Baseline

优先复用：

- SQLite 初始化。
- refinery 迁移机制。
- repository 测试结构。
- DB 连接和 app state 管理。

不能作为最终契约复用：

- 旧 25 个 migrations。
- podcast、animation、points、export 相关表。

做法：

- 以 `docs/database-baseline.md` 建新 V1 baseline。
- 从旧 repository 中借鉴写法，不继承旧 schema 负担。

### M03：Documents Import Parse

优先复用：

- document repository 中可用的文件和文档记录逻辑。
- Python parsing 能力。
- orchestration service 启动机制。
- BackgroundJob 相关已有结构。

需要适配：

- 文件导入必须按 hash 去重。
- Python 不直接写 SQLite。
- 解析结果必须经 Rust 写入 `documents / document_chunks / background_jobs`。

### M04：Cards Groups

优先复用：

- 旧 cards gateway、commands、repository 的基础 CRUD 思路。
- 前端卡片列表和编辑组件中可用的部分 UI。

需要收敛：

- 只保留 Basic 单卡型。
- 不引入复杂卡型、media、APKG、候选审核。
- 分组就是学习单位。

### M05：Study Loop

优先复用：

- 旧 review logs 或 cards 相关测试思路。
- 前端复习页面可用 UI 片段。

需要重建或适配：

- 以 `docs/review-scheduler.md` 为权威。
- Rust 后端是调度权威。
- `ts-fsrs` 只能参考，不能成为状态源。

### M07-M09：BYOK And AI Generation

优先复用：

- Stronghold 相关逻辑。
- Provider runtime。
- LiteLLM adapter。
- Python card generation workflow 的可用片段。
- orchestration/gateway 通信基础。

需要收敛：

- Provider 配置只保留 MVP 最小字段。
- Python 不直接写 SQLite。
- AI 生成结果必须由 Rust 校验并一次性入库。
- 失败不部分入库。
- 不把 agent、RAG、podcast、animation 带回 MVP-1。

## 完成规则

每个 milestone 的完成标准不是“是否写了新代码”，而是：

- 是否满足对应 milestone 验收场景。
- 是否符合五份工程契约文档。
- 是否通过关键测试。
- 是否没有把冻结模块带回 MVP 主线。
- 是否复用了已有可用底座，避免无意义重写。

## 默认假设

- 仓库当前处于开发期，不要求兼容旧本地数据。
- 旧代码可以作为资产库，但不能压过新 `docs/` 契约。
- 如果旧实现与新契约冲突，以新契约为准。
- 若重写比适配更小、更清晰、更可测试，可以选择 `replace`，但需要在开发记录中说明原因。
