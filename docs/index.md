# RAG / MVP-3 清晰入口

这组文档是后续开发 RAG 知识问答的优先入口，使用中文编写，绑定当前代码骨架，不重写旧文档内容。

- [RAG 知识问答设计文档](./rag-knowledge-qa.md)
- [RAG -> Agent -> Multi-Agent 升级总路线图](./rag-agent-upgrade-roadmap.md)
- [RAG 问答 LangGraph 化改造文档](./rag-langgraph-migration.md)
- [多 Agent 升级开发文档](./multi-agent-development-guide.md)
- [RAG Context Engineering](./rag-context-engineering.md)
- [Embedding 与混合检索升级蓝图](./embedding-hybrid-retrieval-upgrade.md)
- [RAG 检索质量升级蓝图](./rag-retrieval-upgrade.md)
- [Chunking 优化策略](./chunking-optimization-strategy.md)
- [RAG 验收测试](./rag-acceptance-tests.md)
- [MVP-3：RAG 知识问答 MVP](./mvps/mvp-3.md)
- [M12：RAG Foundation](./milestones/m12-rag-foundation.md)
- [M13：RAG Retrieval Quality](./milestones/m13-rag-retrieval-quality.md)
- [M14：RAG UI Polish](./milestones/m14-rag-ui-polish.md)

RAG 第一版定位为学习型问答：必须基于已向量化文档回答，结构化讲解，引用忠实，不做通用聊天、不做 FTS-only 正式回答、不做 Reader 跳转。

# XueJian 文档索引

本文档是 `docs/` 的当前开发文档入口，用于帮助开发者和后续 AI agent 快速判断应该先读什么、每份文档负责什么、发生冲突时以谁为准。

`docs/archive/*` 是历史归档，只作为背景参考，不作为当前实现依据。

## 快速入口

### 新开发者

阅读顺序：

```text
spec.md -> architecture.md -> mvps/README.md -> 当前 MVP 文档
-> reuse-strategy.md -> milestones/README.md -> 当前里程碑文档
```

目的：

- 先理解产品方向和 MVP 边界。
- 再理解系统分层和数据权威。
- 最后按当前 MVP runbook 执行开发。

### 做前端

阅读顺序：

```text
ui.md -> 学习工作台_交互界面设计规范_v1.0.md
-> spec.md -> 当前 MVP 文档 -> 当前里程碑文档
```

需要同时参考：

- `ui.md` 是 UI 权威总纲，学习工作台手册是详细页面、组件、状态和主题补充。
- 对应模块文档，例如 `modules/documents.md`、`modules/cards.md`、`modules/study.md`。
- `architecture.md` 中的 Tauri commands、gateway 和数据权威边界。

### 做模块实现

阅读顺序：

```text
modules/*.md -> architecture.md -> 当前 MVP 文档
-> 当前里程碑文档
```

模块文档负责领域流程和状态，MVP 文档负责当前阶段的任务顺序和验收。

### 做阶段实施

阅读顺序（MVP 基础闭环）：

```text
mvps/README.md -> mvps/mvp-0.md -> mvps/mvp-1.md -> mvps/mvp-2.md
-> milestones/README.md
```

不得跳过 `MVP-0` 直接实施后续阶段。后续阶段依赖前一阶段产生的文档、卡片、分组、复习状态和学习事件。

执行每个里程碑前，还应阅读 `reuse-strategy.md`，先审计现有资产，再决定直接复用、适配复用、冻结参考或按新契约重写。

阅读顺序（RAG -> Agent -> Multi-Agent 新一轮升级）：

```text
rag-agent-upgrade-roadmap.md
-> rag-langgraph-migration.md
-> multi-agent-development-guide.md
```

旧 P00-P06 阶段文档已实现并归档，不再作为当前开发入口。当前重点是 RAG 问答 LangGraph 化，以及在统一 LangGraph 编排标准下推进 Card Graph、Study Graph 和 Multi-Agent Orchestrator。

### 做工程契约

阅读顺序：

```text
database-baseline.md -> ipc-api.md -> background-jobs.md
-> review-scheduler.md -> ai-card-generation.md
```

其中：

- 做数据库或 M02：先读 `database-baseline.md`。
- 做 Tauri commands、gateway 或页面数据接入：先读 `ipc-api.md`。
- 做 PDF 解析任务或 AI 生成任务：先读 `background-jobs.md`。
- 做复习队列、反馈和统计：先读 `review-scheduler.md`。
- 做 AI 卡片生成：先读 `ai-card-generation.md`。

## 权威关系

发生冲突时按以下规则处理：

- 产品边界、MVP 范围、阶段路线：以 [spec.md](./spec.md) 为准。
- 架构边界、数据权威、长任务、密钥流转：以 [architecture.md](./architecture.md) 为准。
- RAG -> Agent -> Multi-Agent 全局原则和不可变底线：以 [rag-agent-upgrade-roadmap.md](./rag-agent-upgrade-roadmap.md) 为准；已实现的旧 P00-P06 阶段 runbook 已归档到 [archive/phases-implemented-2026-05-13](./archive/phases-implemented-2026-05-13/README.md)。
- RAG 问答 LangGraph 化改造：以 [rag-langgraph-migration.md](./rag-langgraph-migration.md) 为准。
- 多 Agent 升级方向、Single Agent 前置门槛、Card Graph、Study Graph、Multi-Agent Orchestrator、权限矩阵、artifact 通信和 fallback：以 [multi-agent-development-guide.md](./multi-agent-development-guide.md) 为准。
- 模块内部流程、状态和验收场景：以 [modules/\*.md](./modules/) 为准。
- UI 视觉、组件、页面和前端实施规范：以 [ui.md](./ui.md) 为准。
- UI 详细页面、组件、状态、主题和交互手册：参考 [学习工作台交互界面设计规范](./学习工作台_交互界面设计规范_v1.0.md)，但与 `ui.md` 或 `spec.md` 冲突时以后者为准；其中 `Proposal` 内容必须先同步产品路线文档，才能进入实施。
- 数据库 V1 baseline、字段、索引和迁移策略：以 [database-baseline.md](./database-baseline.md) 为准。
- Tauri commands、gateway、DTO 和错误模型：以 [ipc-api.md](./ipc-api.md) 为准。
- 后台任务状态机、取消、重试和恢复语义：以 [background-jobs.md](./background-jobs.md) 为准。
- 复习调度、四档反馈、队列和统计口径：以 [review-scheduler.md](./review-scheduler.md) 为准。
- AI 卡片生成输入、输出、校验和入库策略：以 [ai-card-generation.md](./ai-card-generation.md) 为准。
- 现有代码资产复用、适配、冻结和替换规则：以 [reuse-strategy.md](./reuse-strategy.md) 为准。
- MVP 执行顺序、任务拆分和阶段验收：以 [mvps/\*.md](./mvps/) 为准。
- 具体开发里程碑、任务分配和完成门槛：以 [milestones/\*.md](./milestones/) 为准。

## 正式文档清单

### 总纲与架构

- [spec.md](./spec.md)：项目开发全景图，维护产品方向、MVP 边界、阶段路线、关键技术决策和仓库处置策略。
- [architecture.md](./architecture.md)：系统架构总览，维护 React/Tauri、Rust、Python orchestration、SQLite、Stronghold、BackgroundJob 和 gateway 的职责边界。
- [multi-agent-development-guide.md](./multi-agent-development-guide.md)：多 Agent 升级唯一权威文档，维护 Single Agent QA 前置门槛、Card Graph、Study Graph、Multi-Agent Orchestrator、权限矩阵、artifact refs 通信、fallback 和 trace/event/checkpoint 边界。
- [rag-agent-upgrade-roadmap.md](./rag-agent-upgrade-roadmap.md)：RAG -> Agent -> Multi-Agent 升级总路线图，维护强 RAG、单 Agent、Memory/Card Tools、多 Agent Runtime 的全局顺序和不可变底线。
- [rag-langgraph-migration.md](./rag-langgraph-migration.md)：RAG 问答 LangGraph 化改造文档，维护 KnowledgeGraph 目标形态、状态、节点、迁移步骤、fallback 和验收标准。
- [ui.md](./ui.md)：前端设计与实施规范权威总纲，维护 UI 边界、阶段标签、导航、主题模型、组件原则和前端实施规则。
- [学习工作台\_交互界面设计规范\_v1.0.md](./学习工作台_交互界面设计规范_v1.0.md)：UI 详细执行手册，维护页面、组件、状态、Light/Dark/System 主题和交互细节；其中 `Proposal` 不作为当前验收依据。
- [reuse-strategy.md](./reuse-strategy.md)：现有资产复用策略，维护里程碑开发前的资产审计、复用、适配、冻结和替换规则。

### 工程契约

- [database-baseline.md](./database-baseline.md)：V1 SQLite baseline、核心表、字段、索引、关系和迁移策略。
- [ipc-api.md](./ipc-api.md)：Tauri commands、前端 gateway、DTO、分页、错误模型和模块 API 契约。
- [background-jobs.md](./background-jobs.md)：后台任务类型、状态机、进度、取消、重试、恢复和错误语义。
- [review-scheduler.md](./review-scheduler.md)：复习调度权威、四档反馈、每日队列、StudyEvent 和统计口径。
- [ai-card-generation.md](./ai-card-generation.md)：AI 卡片生成输入输出、LiteLLM/Pydantic 契约、来源校验和自动入库策略。
- [chunking-optimization-strategy.md](./chunking-optimization-strategy.md)：Chunking 优化策略，维护 Section/Parent/Child 分块目标、规则优先策略、metadata、RAG/制卡双目标和后续落地阶段。
- [embedding-hybrid-retrieval-upgrade.md](./embedding-hybrid-retrieval-upgrade.md)：Embedding 与混合检索升级蓝图，维护 embedding profile、FTS5/BM25、中文 n-gram、RRF、query cache、增量 embedding 与 hybrid retrieval trace 的底座策略。
- [rag-context-engineering.md](./rag-context-engineering.md)：RAG 多轮上下文工程原则，维护单会话记忆、query rewrite、长上下文预算、压缩和证据边界。
- [rag-retrieval-upgrade.md](./rag-retrieval-upgrade.md)：RAG 检索质量升级蓝图，维护 Parent/Child Auto-merging、rerank、相关性门控、二次检索和 RAG trace UI 的阶段路线。

### 模块专项

- [modules/documents.md](./modules/documents.md)：Documents 模块，维护 PDF 导入、解析、阅读器和来源定位设计。
- [modules/cards.md](./modules/cards.md)：Cards 模块，维护卡片模型、分组、来源绑定和卡片管理设计。
- [modules/study.md](./modules/study.md)：Study 模块，维护复习调度、每日队列、反馈和学习统计设计。
- [modules/ai.md](./modules/ai.md)：AI 模块，维护 Provider、LiteLLM、Pydantic schema 和 AI workflow 设计。

### MVP Runbook

- [mvps/README.md](./mvps/README.md)：MVP 阶段索引、依赖顺序、执行原则和权威关系。
- [mvps/mvp-0.md](./mvps/mvp-0.md)：无 AI 的本地学习闭环。
- [mvps/mvp-1.md](./mvps/mvp-1.md)：AI 卡片生成与 BYOK。
- [mvps/mvp-2.md](./mvps/mvp-2.md)：PDF 阅读联动与学习统计体验。

### 里程碑执行

- [milestones/README.md](./milestones/README.md)：里程碑索引、依赖顺序、执行规则和完成门槛。
- [milestones/m01-scope-and-shell.md](./milestones/m01-scope-and-shell.md)：冻结超前入口、收敛主导航、建立 AppShell 基线。
- [milestones/m02-data-baseline.md](./milestones/m02-data-baseline.md)：建立 V1 SQLite baseline、核心表、Rust 数据权威。
- [milestones/m03-documents-import-parse.md](./milestones/m03-documents-import-parse.md)：PDF 导入、hash 去重、PyMuPDF 解析、BackgroundJob。
- [milestones/m04-cards-groups.md](./milestones/m04-cards-groups.md)：Basic 卡片、分组 CRUD、软删除、筛选。
- [milestones/m05-study-loop.md](./milestones/m05-study-loop.md)：ReviewState、四档反馈、每日队列、StudyEvent。
- [milestones/m06-mvp0-hardening.md](./milestones/m06-mvp0-hardening.md)：MVP-0 端到端验收、错误状态、基础测试补齐。
- [milestones/m07-provider-byok.md](./milestones/m07-provider-byok.md)：ProviderConfig、Stronghold、OpenAI/Anthropic/OpenAI-compatible。
- [milestones/m08-ai-card-generation.md](./milestones/m08-ai-card-generation.md)：LiteLLM、Pydantic schema、AI BackgroundJob、自动入库。
- [milestones/m09-ai-generation-ui.md](./milestones/m09-ai-generation-ui.md)：文档页生成入口、密度/范围/分组选择、任务状态、批量删除补救。
- [milestones/m10-reader-linking.md](./milestones/m10-reader-linking.md)：pdfjs-dist Reader、沉浸模式、当前页相关卡片侧栏。
- [milestones/m11-dashboard-and-polish.md](./milestones/m11-dashboard-and-polish.md)：首页统计、热力图、文档/分组进度、UI 打磨。

## 暂未建立但后续需要

以下文档尚未建立，后续应从 `spec.md`、`architecture.md` 和当前 MVP 实施经验中派生：

- `docs/modules/settings.md`：Settings 模块、Provider 配置、学习偏好、本地数据配置。

## 归档说明

`docs/archive/*` 保持归档状态。

归档文档规则：

- 不作为当前开发依据。
- 不参与当前路线决策。
- 不要求与当前文档保持一致。
- 只有在需要追溯历史想法时才阅读。

当前正式开发请优先阅读本文档列出的正式文档清单。
