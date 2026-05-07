# XueJian 开发全景图 v0.4

## 1. 项目愿景

XueJian 是一款强本地优先的 PDF 学习闪卡桌面应用。它的核心价值不是简单总结 PDF，而是把 PDF 中的知识转化为可管理、可复习、可追踪的学习资产。

项目第一阶段围绕一个主闭环展开：

```text
PDF 导入 -> 文档解析 -> 卡片生成/编辑 -> 分组管理 -> 每日复习 -> 学习反馈
```

长期来看，XueJian 可以扩展为本地优先的 AI 学习工作台，但所有扩展能力都必须服务学习闭环，而不是堆叠松散的 AI 功能。

## 2. 文档定位

本文档是“开发全景图 + 当前仓库处置策略”，不是完整工程执行手册。

它的目标是回答：

- 为什么做这个产品。
- 第一阶段做什么，不做什么。
- 当前仓库有哪些可复用资产和历史包袱。
- 系统由哪些模块组成。
- 技术选型如何落定。
- 目标目录结构如何演进。
- 哪些模块应保留、冻结、审计或后续清理。
- 哪些能力需要后续单独细化为工程文档。

本文档面向：

- 项目开发者本人。
- 后续参与实现的 AI 开发助手。
- 需要快速理解项目方向、仓库现状和阶段路线的工程协作者。

本文档保持中层决策粒度，不钉死所有 API 字段、数据库字段、算法参数和 UI 细节。这些内容应在后续专项工程文档中定义。

### 2.1 文档体系索引

当前文档体系采用“总纲 + 架构 + 模块专项”的结构：

- `docs/index.md`：当前开发文档入口索引，按阅读目的说明文档顺序、用途和权威关系。
- `docs/spec.md`：项目开发全景图，维护产品方向、MVP 边界、阶段路线、关键技术决策和仓库处置策略。
- `docs/architecture.md`：系统架构总览，维护 React/Tauri、Rust、Python orchestration、SQLite、Stronghold、BackgroundJob 和 gateway 的职责边界。
- `docs/modules/documents.md`：Documents 模块专项，维护 PDF 导入、解析、阅读器和来源定位设计。
- `docs/modules/cards.md`：Cards 模块专项，维护卡片模型、分组、来源绑定和卡片管理设计。
- `docs/modules/study.md`：Study 模块专项，维护复习调度、每日队列、反馈和学习统计设计。
- `docs/modules/ai.md`：AI 模块专项，维护 Provider、LiteLLM、Pydantic schema 和 AI workflow 设计。
- `docs/ui.md`：前端设计与实施规范，维护视觉语言、组件风格、页面布局、交互状态和 UI 落地规则。
- `docs/reuse-strategy.md`：现有资产复用策略，维护里程碑开发前的资产审计、复用、适配、冻结和替换规则。
- `docs/database-baseline.md`：数据库工程契约，维护 V1 SQLite baseline、核心表、字段、索引、关系和迁移策略。
- `docs/ipc-api.md`：IPC 工程契约，维护 Tauri commands、前端 gateway、DTO、分页和错误模型。
- `docs/background-jobs.md`：后台任务工程契约，维护长任务状态机、进度、取消、重试、恢复和错误语义。
- `docs/review-scheduler.md`：复习调度工程契约，维护四档反馈、每日队列、ReviewState、StudyEvent 和统计口径。
- `docs/ai-card-generation.md`：AI 卡片生成工程契约，维护生成输入输出、Pydantic 校验、来源绑定和自动入库策略。
- `docs/mvps/*.md`：MVP 阶段实施 runbook，维护每个 MVP 的执行顺序、任务拆分、阶段验收和测试场景。
- `docs/milestones/*.md`：开发里程碑执行计划，维护纵向交付顺序、任务分配、完成门槛和解锁关系。

文档权威关系：

- 产品边界、阶段路线和是否纳入 MVP，以 `docs/spec.md` 为准。
- 跨层调用、数据权威、长任务和密钥流转，以 `docs/architecture.md` 为准。
- 模块内部流程、状态和验收场景，以对应 `docs/modules/*.md` 为准。
- 视觉细节、组件规范、页面布局和前端实施规则，以 `docs/ui.md` 为准。
- 现有代码资产的复用、适配、冻结和替换规则，以 `docs/reuse-strategy.md` 为准。
- 数据库字段、索引、关系和迁移 baseline，以 `docs/database-baseline.md` 为准。
- Tauri commands、gateway、DTO 和错误模型，以 `docs/ipc-api.md` 为准。
- 长任务状态机、进度、取消、重试和恢复语义，以 `docs/background-jobs.md` 为准。
- 复习调度、反馈映射、队列和统计口径，以 `docs/review-scheduler.md` 为准。
- AI 卡片生成输入输出、校验、来源绑定和入库策略，以 `docs/ai-card-generation.md` 为准。
- MVP 实施顺序、阶段验收和开发任务拆分，以 `docs/mvps/*.md` 为准。
- 具体开发里程碑、任务分配和完成门槛，以 `docs/milestones/*.md` 为准。

## 3. 当前仓库盘点

当前仓库不是空项目，已有较多历史实现。v0.4 的规划原则是：**保留现有技术底座，冻结超前功能，按新 MVP 路线重组目录与文档，不推倒重来。**

### 3.1 顶层结构

当前顶层结构包括：

```text
docs/
examples/
runtime/
scripts/
xuejian/
```

其中：

- `docs/`：当前正式总纲和归档文档。
- `examples/`：设计参考和样例代码。
- `runtime/`：运行时产物和 smoke 产物。
- `scripts/`：CI 或辅助脚本。
- `xuejian/`：主应用目录，包含前端、Tauri/Rust、Python orchestration 和测试。

### 3.2 前端现状

`xuejian/src` 已经形成以下结构：

```text
src/features/
src/components/
src/queries/
src/services/gateway/
src/store/
src/design-system/
src/services/renderer/
```

已有页面和功能覆盖：

- dashboard/home。
- documents/library/reader。
- cards/card studio。
- review/learning。
- settings/BYOK。
- V1.1 knowledge QA / 文档 RAG。
- podcast。
- profile/points。
- animation/card preview。

这些实现中，部分可作为技术资产复用，部分已经超出当前 MVP 范围。

### 3.3 Tauri/Rust 现状

`xuejian/src-tauri/src` 已经包含：

```text
commands/
db/
gateway/
tasks/
migrations/
secrets/
app_state.rs
```

已有能力包括：

- Tauri commands。
- SQLite 初始化和仓储层。
- refinery migrations。
- Stronghold 密钥存储和恢复逻辑。
- host HTTP gateway。
- Python orchestration service 启动任务。
- documents/cards/settings/knowledge/podcast/animation/points 等命令模块。

### 3.4 Python orchestration 现状

`xuejian/orchestration_service` 已经包含：

```text
providers/
workflows/
parsing/
schemas/
clients/
server.py
```

已有能力包括：

- PDF 解析相关 pipeline。
- Provider runtime。
- LiteLLM/OpenAI/Anthropic 相关适配基础。
- card generation workflow。
- document embedding workflow。
- knowledge QA workflow。
- podcast workflow。
- card animation workflow。

### 3.5 历史超前模块

当前仓库中已经存在若干超出 MVP v0.4 主线的模块；其中 Knowledge QA / RAG 已进入 V1.1 路线，其余仍按冻结资产管理：

- podcast。
- animation。
- points。
- APKG/export。
- annotated PDF export。
- card animation。

Knowledge QA / RAG 在 MVP UI 稳定后进入 V1.1 主导航和验收；其余模块不应直接进入第一阶段主导航和主开发路线，先作为历史资产冻结，后续根据路线图审计、复用或移除。

### 3.6 已知风险点

当前盘点发现以下风险：

- Python `server.py` 引用了 `orchestration_service.exports` 相关模块，但当前文件盘点未看到对应 `exports/` 目录，需要审计。
- README 引用了多份历史文档，但当前 `docs/` 实际只有 `spec.md` 和 `archive/`，需要更新。
- 数据库 migrations 已累积到大量版本，并包含不少超前功能表，后续不应无条件继承。
- 前端主导航在 V1.1 可纳入 `knowledge`；`profile` 等仍超出新 MVP/V1.1 范围，需要冻结或隐藏。
- mock gateway 中包含大量历史命令模拟，后续需要按新 MVP 筛选。

## 4. 目标用户与核心问题

### 4.1 目标用户

XueJian 第一版面向重度自学者，包括：

- 研究生。
- 考研、考证和职业资格学习者。
- 需要长期阅读教材、讲义、论文、技术文档的人。
- 希望把阅读材料转化为长期记忆资产的人。

这些用户不是只想“问一个问题”或“看一段总结”，而是希望把资料变成可以反复学习、复习和追踪的知识体系。

### 4.2 核心问题

目标用户面临的问题是：

- PDF 读过后难以沉淀。
- 资料中的知识点难以系统复习。
- 手动制作闪卡成本高。
- 阅读、卡片、复习记录相互割裂。
- AI 工具能生成内容，但生成结果不一定能进入长期学习流程。

XueJian 要解决的问题是：让用户从 PDF 出发，形成稳定的学习资产和复习流程。

## 5. 核心产品闭环

第一版产品闭环如下：

```text
导入 PDF
-> 提取文本和页码信息
-> 生成或手动创建卡片
-> 卡片绑定来源
-> 用户按分组管理卡片
-> 每日复习启用分组中的到期卡片
-> 记录反馈和学习统计
```

这个闭环中的核心对象是卡片。PDF 是知识来源，AI 是辅助生产工具，分组是学习组织单位，复习系统负责长期记忆。

AI 不是学习资产的唯一来源。用户可以手动创建、编辑、删除卡片。AI 生成的内容必须进入用户可控的卡片系统，而不是停留在一次性的聊天结果中。

## 6. 设计原则

### 6.1 本地优先

PDF、卡片、分组、复习记录和学习统计默认保存在本地。只有当用户主动调用外部模型时，应用才发送必要文本片段到用户配置的 Provider。

### 6.2 用户掌控学习资产

卡片最终属于用户。无论卡片来自 AI 生成还是手动创建，用户都应能编辑、删除、移动分组和暂停学习。

### 6.3 来源可追踪

卡片应尽量保留来源文档、页码和文本片段。第一版不追求精确坐标高亮，但必须保留基本来源关系，为后续 RAG、引用和阅读联动打基础。

### 6.4 MVP 克制

第一版优先跑通 PDF 到卡片再到复习的主闭环。OCR、RAG、播客、同步、导出、动画等能力不进入最初核心交付。

### 6.5 复用底座，冻结超前功能

现有仓库已经有可用底座，不应推倒重来。但超前功能不能继续污染 MVP 范围，应先冻结、隐藏入口、停止主线开发，再逐步审计。

### 6.6 长期能力服务学习闭环

后续加入 RAG、播客脚本、TTS 等能力时，必须与文档、卡片、来源和学习记录产生关系。不要把产品扩展成多个互不相干的 AI 小工具。

## 7. 技术选型

### 7.1 桌面与前端

目标技术栈沿用现有项目：

```text
Tauri 2 + React 19 + Vite + TypeScript
```

配套技术：

- TanStack Query：服务端状态和异步数据。
- Zustand：轻量 UI 状态。
- pdfjs-dist：PDF 阅读器基础。
- Radix UI：基础交互组件。
- lucide-react：图标。
- Zod：前端输入和 gateway 响应校验。
- Vitest：单元测试。
- Playwright：E2E 测试。

UI 将重新设计，参考：

```text
examples/sample of design code/b_Iz00yhVXR1g
```

该示例是 Next.js 项目，只作为视觉、布局、组件表达和 shadcn/Radix 风格参考。XueJian 不迁移到 Next.js，仍保留 Vite/Tauri 应用形态。

### 7.2 Rust/Tauri

Rust/Tauri 继续作为本地应用主干：

- Tauri commands。
- SQLite/rusqlite 数据层。
- refinery migration 管理。
- Stronghold 密钥存储。
- host HTTP gateway。
- Python orchestration service 启动和健康检查。
- 本地文件、日志、应用状态管理。

Rust 的职责是稳定、可审计的本地基础设施，不承接复杂 AI 编排。

### 7.3 Python orchestration

Python `orchestration_service` 继续负责：

- PDF 解析和文档处理。
- AI 卡片生成。
- Provider adapter。
- 后续 RAG、播客脚本、TTS 等工作流。

可继续参考或复用的生态：

- Docling。
- PyMuPDF。
- LiteLLM。
- OpenAI SDK。
- Anthropic / LangChain 相关依赖。
- Pydantic / PydanticAI。

Python 的职责是处理 AI 与文档工作流，不直接成为主数据库。

### 7.4 密钥存储

密钥存储沿用现有：

```text
tauri-plugin-stronghold
```

不切换到系统钥匙串。原因是仓库已有 Stronghold 初始化、恢复和 API key 状态重置逻辑，直接复用成本最低。

## 8. 系统模块地图

目标业务模块划分为五个领域：

```text
documents / cards / study / ai / settings
```

### 8.1 documents

负责 PDF 导入、存储、解析、阅读和来源定位。

包含：

- 文档库。
- PDF 阅读器。
- 页面文本和 chunk。
- 来源 anchor。
- 阅读页右侧卡片联动。

PDF 阅读器归属 documents，不单独成立 reader 领域。

### 8.2 cards

负责学习资产本身。

包含：

- 卡片 CRUD。
- 卡片来源展示。
- 卡片分组。
- AI 生成结果入库后的管理。

卡片结构保持简单：

```text
标题 + 正面 + 背面
```

### 8.3 study

负责每日复习和学习反馈。

包含：

- 到期卡片。
- 四档反馈。
- Rust FSRS 或等价后端调度。
- 学习事件。
- 学习统计。

### 8.4 ai

负责 AI 编排入口和 Provider 配置。

包含：

- BYOK Provider 配置。
- 卡片生成任务入口。
- 后台 AI 工作流状态。
- 后续 RAG、播客脚本、TTS 的扩展入口。

AI 模块不承载所有未来 AI 页面，不把冻结功能重新抬进 MVP 核心。

### 8.5 settings

负责应用配置。

包含：

- Provider 设置。
- Stronghold key 状态。
- 学习偏好。
- 本地数据目录信息。
- 基础外观和行为偏好。

## 9. 系统模块技术决策

本章记录当前已拍板的模块级技术决策。它不是完整工程设计，但后续工程文档和实现应以这些 ADR 为边界。

### 9.1 Documents 模块 ADR

Documents 模块负责 PDF 导入、存储、解析、阅读和来源定位。该模块是卡片生成、PDF 侧栏联动和未来 RAG 的地基。

已确定决策：

- PDF 解析采用双层策略：`PyMuPDF + Docling`。
- PyMuPDF 是 MVP 主线，用于快速解析可复制文本 PDF。
- Docling 是按需后台增强能力，不阻塞 MVP 导入流程。
- 前端 PDF 阅读器基于 `pdfjs-dist` 自建，不嵌入完整 PDF.js Viewer。
- Source anchor 保存到 `page + quote + optional bbox` 粒度。
- Chunk 面向卡片生成和未来 RAG，保存顺序、页码范围和文本。
- PDF 导入后复制到应用数据目录，不引用原路径。
- 重复导入按文件 hash 识别，并提示用户打开已有文档或作为副本导入。
- MVP 文件类型仅支持 PDF。

设计理由：

- PyMuPDF 轻量、速度快、坐标能力实用，适合作为首版解析主线。
- Docling 的结构化文档模型、layout 和 provenance 适合后续表格、层级和 RAG 增强，但不应拖慢 MVP。
- 自建 `pdfjs-dist` 阅读器更利于实现右侧卡片、页码联动和未来高亮层。

暂缓事项：

- Docling 增强任务的触发 UI。
- 扫描版 PDF 和 OCR。
- 精确词级坐标定位。
- 表格、图片、公式的结构化学习卡片生成。

### 9.2 AI 编排模块 ADR

AI 模块负责 Provider 配置、卡片生成任务入口和后台 AI 工作流状态。AI 是辅助生产系统，不是核心数据库。

已确定决策：

- Provider 主路线采用 `LiteLLM`。
- MVP Provider 范围为 OpenAI、Anthropic 和 OpenAI-compatible。
- 结构化输出统一用 Pydantic schema 校验。
- Provider 原生结构化输出能力可以后续增强，但不作为 MVP 唯一依赖。
- MVP 卡片生成采用确定性 workflow，不采用 Agent 作为主线。
- LangChain 相关代码冻结为后续 RAG 或 Agent 实验库存。
- Rust 管理任务状态、数据库和密钥。
- Python 只执行 workflow，并通过 host gateway 读取数据、回报进度和写回结果。
- Rust 与 Python orchestration 保留本地 HTTP 通信。
- API Key 由 Rust 从 Stronghold 短时注入 Python workflow，不落盘、不写日志。
- MVP 卡片生成输出最小字段：`title/front/back/sourcePage/sourceQuote/sourceChunkIds/confidence/tags`。
- AI 生成任务失败时不部分入库，避免污染卡片库。
- MVP 暂不做复杂预算系统。

设计理由：

- LiteLLM 能统一多 Provider 调用，适合 BYOK 和 OpenAI-compatible 服务。
- Pydantic schema 是跨 Provider 的稳定边界，可以隔离不同模型的输出差异。
- 确定性 workflow 更适合 MVP 的可控执行、失败处理和测试。
- Rust 作为本地数据权威，能避免 Python 直接写 SQLite 带来的状态分裂。

暂缓事项：

- Provider 原生 JSON Schema / tool calling 优化。
- Agent 编排。
- 成本预算和用量统计。
- 多工作流模型分配。
- RAG、播客脚本和 TTS 的具体 workflow 契约。

### 9.3 Data 模块 ADR

Data 模块负责本地结构化数据、应用数据目录、迁移策略和后台任务状态。

已确定决策：

- 当前仍处开发期，数据库折叠为新的 `V1` baseline。
- 旧 25 个 migrations 归档为参考库存，不作为未来必须继承的历史。
- 不保证兼容旧本地开发数据。
- Rust/SQLite 是唯一数据权威。
- Python orchestration 不直接读写 SQLite。
- 迁移工具保留 `refinery`。
- SQLite 保留 WAL 和 foreign keys。
- 主键采用 UUID 文本。
- 时间字段采用 UTC ISO 字符串，展示层转换为本地时区。
- 核心业务数据软删除为主。
- Rust repo 按领域组织：`documents/cards/study/ai/settings`。
- MVP 预留 FTS，覆盖文档 chunk 和卡片。
- 向量检索和 `sqlite-vec` 后置到 V1.1 RAG。
- `background_jobs` 覆盖所有长任务，包括 PDF 解析、AI 生成、Docling 增强、未来 embedding/RAG/播客。
- `provider_configs` 只保存非敏感信息和 Stronghold key ref。

目标核心表：

```text
documents
document_chunks
source_anchors
cards
card_groups
review_states
study_events
background_jobs
provider_configs
```

设计理由：

- 新 baseline 可以清理历史超前功能表，避免 MVP 长期背负无关 schema。
- Rust 作为数据权威可保证 Tauri 命令、前端状态和任务状态的一致性。
- FTS 是低成本的 MVP 搜索能力，也为未来 RAG 提供文本检索基础。

暂缓事项：

- 完整字段级 schema。
- sqlite-vec 表结构。
- 数据导入导出。
- 旧开发数据迁移。
- 汇总统计缓存表。

### 9.4 Cards 模块 ADR

Cards 模块负责学习资产本身。卡片是系统核心对象，PDF、AI 和复习都围绕卡片展开。

已确定决策：

- MVP 只做 Basic 单卡型。
- 不做完整 Anki note/card type 系统。
- 不保留 choice、image occlusion、media、APKG、cluster 作为 MVP 主线。
- 卡片字段收敛为 `title/front/back/source/tags/group`。
- `front/back` 支持 Markdown + KaTeX。
- `CardGroup` 是全局学习单位，不强绑定单一文档。
- AI 生成卡必须有来源；手动卡来源可空。
- tags 是轻量辅助筛选，不作为学习单位。
- AI 生成成功后直接写入 `cards`。
- MVP 不做 `card_candidates` 表和候选审核流。
- 卡片采用软删除。
- 去重范围为同一分组内的 `front/back`。
- 不做生成批次撤销；卡片列表必须支持多选和批量删除，作为 AI 自动入库的补救机制。

设计理由：

- Basic 单卡型足以支撑 PDF 到复习的主闭环。
- Markdown + KaTeX 能覆盖学习资料中常见的列表、公式和代码片段。
- 全局分组更适合跨文档主题学习。
- 不做候选审核可以降低第一版交互复杂度，但必须提供批量删除能力。

暂缓事项：

- Cloze、choice、image occlusion。
- 卡片媒体附件。
- APKG 导入导出。
- 卡片簇和知识图谱。
- AI 生成批次撤销。

### 9.5 Study 模块 ADR

Study 模块负责每日复习、调度、反馈和学习统计。

已确定决策：

- 调度底层采用 Rust FSRS 或等价后端实现。
- Rust 后端是复习调度权威。
- 现有前端 `ts-fsrs` 冻结为参考或测试对照，不作为最终状态源。
- UI 显示四档反馈：`忘记 / 模糊 / 记得 / 熟练`。
- 内部映射为 `again / hard / good / easy`。
- `ReviewState` 保存 FSRS 兼容字段，如 `state/difficulty/stability/due/last_review/reps/lapses`。
- 每日学习队列来自启用分组中的到期卡。
- 用户可调每日新卡上限和复习卡上限。
- 默认上限：新卡 20，复习 100。
- 到期卡过多时最早到期优先。
- 学习统计以 `study_events` 为事实来源。
- points/积分系统冻结，不作为学习模块核心。

设计理由：

- FSRS 是成熟的间隔重复调度方案，但用户不需要理解参数。
- 调度权威放在 Rust，可以让数据库状态、Tauri 命令和前端展示保持一致。
- `study_events` 作为统计事实来源，可避免 daily summary 表和真实学习记录不一致。

暂缓事项：

- Rust FSRS 具体 crate。
- FSRS 参数优化。
- 复杂记忆预测。
- 成就、积分和游戏化系统。
- 高级队列排序策略。

### 9.6 Settings 与 UI 模块 ADR

Settings 模块负责应用配置、Provider 配置、Stronghold key 状态、学习偏好和基础外观设置。UI 模块负责新界面系统、导航、页面布局和视觉风格。

已确定决策：

- 设置页只保留 `AI / 学习 / 通用` 三个 tab。
- podcast、points、animation 相关设置冻结隐藏。
- Provider 配置使用最小字段：`name/provider/protocol/base_url/model/key_status/default`。
- 密钥只保存在 Stronghold。
- 模型档案和 workflow assignment 简化为默认 Provider，不保留复杂工作流分配 UI。
- 首次使用不强制配置 API Key。
- 用户可以先手动建卡和复习；触发 AI 生成时再提示配置 Provider。
- UI 重建 `shared/ui`。
- UI 参考 `examples/sample of design code/b_Iz00yhVXR1g` 的 shadcn/Radix 风格和布局表达。
- 不迁移到 Next.js。
- AppShell 采用左侧窄导航 + 内容区。
- 主导航在 V1.1 收敛为 `首页 / 文档 / 卡片 / 学习 / 知识 / 设置`。
- Reader 使用沉浸阅读模式，隐藏主侧栏，左 PDF 右卡片。
- 视觉风格为低噪音专业工具，少量手绘元素作为品牌点缀。

设计理由：

- 设置范围收敛可以避免冻结功能继续污染 MVP。
- 不强制 API Key 能保证 MVP-0 的无 AI 学习闭环成立。
- shadcn/Radix 风格适合构建可维护、可访问、可本地定制的桌面 UI。
- Reader 沉浸模式能最大化阅读空间，适合长时间 PDF 学习。

暂缓事项：

- 完整 UI 组件规范。
- 主题系统扩展。
- 移动端适配。
- 高级 Provider 能力声明。
- workflow assignment UI。

## 10. 目标目录结构

目录重组是目标架构，不要求一次性迁移完成。实际执行应按模块分阶段推进。

### 10.1 前端目标结构

当前 `features/components/services/queries/store/design-system` 可作为迁移库存。目标结构按业务模块重组：

```text
xuejian/src/
  app/
    App.tsx
    routes.ts
    providers.tsx
  modules/
    documents/
    cards/
    study/
    ai/
    settings/
  shared/
    ui/
    lib/
    gateway/
    hooks/
    store/
    types/
```

说明：

- `modules/*` 放领域页面、领域组件、领域 hooks 和领域 queries。
- `shared/ui` 放通用 UI 组件。
- `shared/gateway` 放 Tauri command 调用和 schema 校验。
- `shared/lib` 放通用工具。
- 现有 `knowledge` 进入 V1.1 目标主导航；`podcast`、`animation`、`profile/points` 不进入目标主导航。

### 10.2 Rust/Tauri 目标结构

当前 `commands/db/gateway/tasks` 已可运行，但长期目标是按领域拆分，减少命令和仓储分离过远的问题：

```text
xuejian/src-tauri/src/
  domains/
    documents/
    cards/
    study/
    ai/
    settings/
  infra/
    db/
    gateway/
    secrets/
    tasks/
    migrations/
  app_state.rs
  lib.rs
  main.rs
```

说明：

- `domains/*` 聚合领域 command、repo、DTO 和领域错误。
- `infra/*` 承担 SQLite、Stronghold、gateway、orchestration 启动等基础设施。
- 当前 `commands/` 与 `db/` 可逐步迁移，不要求一次性改动。

### 10.3 Python orchestration 目标结构

Python 目录沿用现有组织：

```text
xuejian/orchestration_service/
  parsing/
  providers/
  workflows/
  schemas/
  clients/
  server.py
```

策略：

- 保留 `parsing`、`providers`、`schemas`。
- MVP 主线只启用文档解析和卡片生成相关 workflow；V1.1 启用 knowledge QA workflow。
- podcast、animation 等 workflow 先冻结。
- `server.py` 中超出 MVP 的 endpoint 后续应审计并按路线隐藏或拆分。

## 11. 核心数据关系与数据库方向

### 11.1 核心实体关系

本文档只定义核心实体和关系，不定义完整数据库 schema。

核心实体：

- `Document`：用户导入的 PDF 文档。
- `DocumentChunk`：文档解析后的文本片段。
- `SourceAnchor`：卡片与原文之间的来源关系。
- `Card`：学习卡片。
- `CardGroup`：卡片分组，也是学习单位。
- `ReviewState`：卡片当前复习状态。
- `StudyEvent`：一次学习行为记录。
- `BackgroundJob`：后台任务，例如解析、生成、索引。
- `ProviderConfig`：模型 Provider 的非敏感配置。

核心关系：

```text
Document -> DocumentChunk -> SourceAnchor -> Card
Card -> CardGroup
Card -> ReviewState -> StudyEvent
ProviderConfig -> AI model calls
BackgroundJob -> long-running workflows
```

### 11.2 数据库 baseline 策略

当前项目尚处开发期，允许规划干净的新 schema baseline，不保证兼容旧本地用户数据。

现有 migrations 包含大量超前能力，后续不应作为未来必须继承的历史。它们应作为参考库存，由数据库专项文档决定保留、折叠或重建。

目标核心表名：

```text
documents
document_chunks
source_anchors
cards
card_groups
review_states
study_events
background_jobs
provider_configs
```

冻结功能相关表，如 podcast、animation、points、APKG/export 等，不进入新 baseline 的核心范围；knowledge QA 相关表随 V1.1 RAG 路线验收。

## 12. MVP 阶段拆分

MVP 不应一次性实现所有能力。建议拆成三个内部阶段。

### 12.1 MVP-0：无 AI 的学习闭环

目标：即使没有 AI，也能跑通最小学习流程。

包含：

- PDF 导入。
- PDF 文件复制到应用库。
- 可复制文本解析。
- 文档列表。
- 手动创建卡片。
- 卡片增删改查。
- 分组增删改查。
- 分组启用和暂停。
- 基础每日复习。
- 四档反馈：忘记、模糊、记得、熟练。

明确不做：

- AI 卡片生成。
- BYOK。
- PDF 阅读页右侧卡片联动。
- 学习统计增强。

### 12.2 MVP-1：AI 生成与 BYOK

目标：让用户可以从 PDF 自动生成中文学习卡片。

包含：

- OpenAI 与 Anthropic Provider 配置。
- API Key 保存到 Stronghold。
- 基于整篇或页码范围生成卡片。
- 生成密度选择：少、中、多。
- AI 生成结果自动入库。
- 为生成卡片保存来源文档、页码和文本片段。
- 卡片生成作为后台任务执行。
- 任务失败时展示可理解错误。

明确不做：

- 草稿审核系统。
- 复杂卡片质量评分。
- RAG 问答。
- 播客脚本和音频。

### 12.3 MVP-2：阅读联动与学习反馈

目标：提升 PDF、卡片和复习之间的体验连贯性。

包含：

- PDF 阅读页。
- 左侧 PDF、右侧当前页相关卡片。
- 从卡片查看来源页码和文本片段。
- 首页学习仪表盘。
- 学习热力图。
- 今日完成数。
- 总学习时长。
- 连续学习天数。
- 文档和分组进度概览。

明确不做：

- 精确坐标高亮。
- OCR。
- 多设备同步。
- 导出。
- 复杂记忆模型预测。

## 13. AI 能力边界

### 13.1 MVP：卡片生成

MVP 中 AI 只承担一个核心任务：根据 PDF 文本生成中文卡片。

约束：

- 输入文档可以是中文、英文或中英混合。
- 内部提示词可以使用英文。
- 最终卡片必须输出中文。
- 卡片应忠实原文。
- 生成结果进入卡片系统，由用户继续管理。

### 13.2 V1.1：文档 RAG 问答

RAG 问答应建立在 MVP 的文档解析和文本分块基础上。

目标：

- 用户可以选择文档进行问答。
- 回答必须显示来源文档和页码。
- 不把 RAG 做成脱离卡片系统的孤立聊天功能。

### 13.3 V1.2：AI 播客脚本

先实现脚本，不直接生成音频。

目标：

- 基于选中文档生成中文访谈脚本。
- 支持忠实朗读稿。
- 支持用户预览和编辑脚本。

### 13.4 V1.3+：TTS 音频生成

在脚本质量稳定后，再接入 TTS。

目标：

- 将脚本生成音频。
- 音频作为后台任务生成。
- 产物保存到应用数据目录。

### 13.5 明确不做：Manim 动画生成

Manim 动画生成从当前产品路线中移除。原因是它会引入高失败率的代码生成、渲染环境和多媒体工作流，容易冲击主学习闭环。

## 14. UI 全景与重设计方向

### 14.1 主导航

目标主导航收敛为：

```text
首页 / 文档 / 卡片 / 学习 / 知识 / 设置
```

不进入 V1.1 主导航：

- 播客。
- 动画。
- 个人/积分。
- 导出。

### 14.2 页面职责

- 首页：学习仪表盘，展示今日待复习、学习连续性、热力图、分组和文档进度。
- 文档：PDF 管理、解析状态、阅读入口、卡片生成入口。
- 卡片：卡片资产管理、搜索、筛选、编辑、分组调整。
- 学习：每日复习、正反面展示、四档反馈。
- 设置：Provider、Stronghold key 状态、本地数据目录、学习偏好。

### 14.3 视觉参考

UI 重新设计，参考：

```text
examples/sample of design code/b_Iz00yhVXR1g
```

参考内容：

- 组件组织方式。
- shadcn/Radix 风格。
- 桌面工作台布局。
- 低噪音界面表达。
- 统一的状态、卡片、侧栏和表单风格。

不参考或不迁移：

- Next.js 架构。
- 服务端组件模式。
- Tailwind 4 配置方式，除非后续单独评估。
- 与 XueJian MVP 无关的页面。

## 15. 复用、冻结、清理清单

### 15.1 复用资产

优先复用：

- Tauri app shell。
- SQLite 初始化和本地数据库基础。
- Stronghold 密钥恢复逻辑。
- host gateway。
- Python orchestration 启动机制。
- PDF 解析相关 Python 能力。
- Provider runtime 和 BYOK 基础。
- Vitest 和 Playwright 测试框架。

### 15.2 参考但不直接照搬

以下内容作为参考库存：

- 现有页面和组件实现。
- 现有 migrations。
- 现有 mock gateway 数据。
- `examples/sample of design code/b_Iz00yhVXR1g`。
- 现有 RAG、podcast、animation workflow 的部分思路。

### 15.3 冻结模块

以下模块暂时冻结，并应隐藏入口、停止作为主线开发：

- podcast。
- animation。
- points。
- APKG/export。
- annotated PDF export。
- card animation。

冻结不代表立即删除。冻结表示：

- 不进入 MVP 主导航。
- 不作为近期验收目标。
- 不继续扩大功能。
- 后续按模块审计其复用价值。

### 15.4 待审计项

后续需要审计：

- Python `server.py` 中引用但可能缺失的 `exports` 目录。
- 旧 README 中引用但当前不存在的 docs 文档。
- 已实现但不属于 MVP 的 commands。
- 已实现但不属于 MVP 的 queries。
- 已实现但不属于 MVP 的 tests。
- settings 中与 podcast、points、animation 等冻结模块相关的字段。
- migrations 中与冻结模块相关的表和索引。

## 16. 文档清理策略

当前文档体系以 `docs/spec.md` 为总纲，并通过 `docs/architecture.md`、`docs/modules/*.md`、`docs/ui.md`、工程契约文档、`docs/mvps/*.md` 与 `docs/milestones/*.md` 承载专项细节。

策略：

- `docs/index.md` 是当前开发文档入口索引。
- `docs/spec.md` 是当前正式开发全景图。
- `docs/architecture.md` 是当前系统架构总览。
- `docs/modules/*.md` 是当前核心模块专项文档。
- `docs/ui.md` 是当前前端设计与实施规范。
- `docs/reuse-strategy.md` 是当前现有资产复用与冻结隔离策略。
- `docs/database-baseline.md` 是当前数据库 V1 baseline 工程契约。
- `docs/ipc-api.md` 是当前 Tauri commands 与前端 gateway 工程契约。
- `docs/background-jobs.md` 是当前后台任务状态机工程契约。
- `docs/review-scheduler.md` 是当前复习调度工程契约。
- `docs/ai-card-generation.md` 是当前 AI 卡片生成工程契约。
- `docs/mvps/*.md` 是当前 MVP 阶段实施 runbook。
- `docs/milestones/*.md` 是当前开发里程碑执行计划。
- `docs/archive/*` 保持归档，不参与当前路线决策。
- README 后续需要更新为真实仓库结构和当前路线。
- README 不应继续引用当前不存在的历史设计文档。
- 后续专项文档应从 `docs/spec.md` 派生，而不是与其并列冲突。

建议后续专项文档：

```text
docs/modules/settings.md
```

## 17. 关键决策记录

### 17.1 已确定决策

- 产品定位是强本地优先的 PDF 学习闪卡桌面应用。
- 目标用户是重度自学者。
- 第一主闭环是 PDF 到卡片再到复习。
- 桌面端沿用 Tauri 2 + React 19 + Vite + TypeScript。
- Rust/Tauri 负责主数据、IPC、SQLite、密钥和本地 gateway。
- Python orchestration 负责 PDF 解析、AI 编排和 Provider adapter。
- 密钥存储沿用 Stronghold。
- UI 重新设计，参考 `examples/sample of design code/b_Iz00yhVXR1g`。
- 主导航收敛为：首页 / 文档 / 卡片 / 学习 / 知识 / 设置。
- 业务领域划分为 documents / cards / study / ai / settings。
- PDF 阅读器归属 documents。
- AI 模块只负责 Provider 和编排入口。
- 当前开发期允许新数据库 baseline，不保证旧本地数据兼容。
- 文档解析采用 PyMuPDF 主线 + Docling 后台增强的双层策略。
- PDF 阅读器基于 `pdfjs-dist` 自建。
- Source anchor 采用 `page + quote + optional bbox`。
- PDF 导入复制到应用库，并按 hash 去重。
- MVP 只支持可复制文本 PDF。
- MVP 不做 OCR。
- Provider 主路线采用 LiteLLM。
- 结构化输出统一使用 Pydantic schema 校验。
- MVP AI 卡片生成采用确定性 workflow，不以 Agent 作为主线。
- Rust 管理任务状态、数据库和密钥，Python 只执行 workflow。
- Rust/SQLite 是唯一数据权威，数据库折叠为新的 `V1` baseline。
- 主键采用 UUID 文本，时间采用 UTC ISO 字符串，核心业务数据软删除。
- MVP 预留 FTS，向量检索后置到 V1.1 RAG。
- MVP 只做 Basic 单卡型。
- 卡片正文支持 Markdown + KaTeX。
- 分组就是学习单位，不引入独立牌组概念。
- AI 卡片生成后自动入库，不做草稿审核。
- BYOK 初始目标支持 OpenAI 与 Anthropic。
- 复习调度底层采用 Rust FSRS 或等价后端实现，用户界面只暴露四档反馈。
- 每日学习队列来自启用分组中的到期卡，默认新卡 20、复习 100。
- 学习统计以 `study_events` 为事实来源。
- 设置页收敛为 `AI / 学习 / 通用`。
- 首启不强制配置 API Key。
- UI 重建 `shared/ui`，参考 shadcn/Radix 风格但不迁移到 Next.js。
- Reader 使用沉浸阅读模式。
- Manim 动画生成从路线中移除。

### 17.2 暂缓决策

以下内容后续需要单独设计，不在本文档中提前锁死：

- 具体数据库 schema 以 `docs/database-baseline.md` 为准，本文档不展开字段。
- 本地 API / IPC 形态以 `docs/ipc-api.md` 为准，本文档不展开 command。
- AI 卡片生成 JSON 契约以 `docs/ai-card-generation.md` 为准，本文档不展开 schema。
- PyMuPDF 与 Docling 的解析契约。
- `pdfjs-dist` 阅读器的组件边界和性能策略。
- 复习调度行为以 `docs/review-scheduler.md` 为准，具体 Rust FSRS crate 或等价实现仍可后续验证。
- 后台任务状态机、重试、取消和恢复策略以 `docs/background-jobs.md` 为准，具体并发执行器可后续验证。
- Provider adapter 能力模型。
- LiteLLM 与 Provider 原生结构化输出的能力分层。
- PDF 阅读器具体组件实现。
- UI 视觉规范和组件系统。
- 旧模块删除时间表。

### 17.3 明确不做

MVP 明确不做：

- 扫描版 PDF OCR。
- 文档 RAG 问答。
- AI 播客音频生成。
- Manim 或其他动画演示生成。
- 多设备同步。
- 账户系统。
- 云端存储。
- 卡片导出。
- 精确 PDF 坐标高亮。
- 复杂记忆模型预测。

## 18. 阶段依赖路线

### 18.1 为什么先做 MVP-0

MVP-0 不依赖外部模型，可以优先验证：

- 本地文档库是否成立。
- 卡片和分组模型是否顺畅。
- 复习流程是否能跑通。
- 桌面端和本地数据层是否稳定。

如果没有这层基础，AI 生成再强也无法沉淀成稳定学习资产。

### 18.2 为什么再做 MVP-1

AI 生成依赖文档解析、卡片系统和分组系统。先有这些基础，AI 结果才能直接进入用户可管理的学习资产。

MVP-1 的重点不是构建通用聊天助手，而是降低用户制作卡片的成本。

### 18.3 为什么再做 MVP-2

阅读联动和统计体验依赖前两个阶段产生的数据。只有当文档、卡片、分组和复习记录都稳定后，学习仪表盘和 PDF 右侧卡片才有足够价值。

### 18.4 为什么 RAG 在 V1.1

RAG 需要稳定的文本分块、来源关系和 Provider 编排。它应该复用 MVP 的基础设施，而不是另起一套聊天系统。

### 18.5 为什么播客在 RAG 之后

播客脚本需要更强的文档理解和内容筛选能力。先做好文档解析、卡片生成和 RAG，再做播客脚本，能降低偏离原文的风险。

## 19. 后续工程文档清单

已建立的工程契约文档：

- `docs/database-baseline.md`：数据库 V1 baseline、字段、索引、迁移策略。
- `docs/ipc-api.md`：Tauri commands、gateway、DTO、分页和错误模型。
- `docs/background-jobs.md`：后台任务状态机、取消、重试、恢复和错误语义。
- `docs/review-scheduler.md`：复习调度、四档反馈、每日队列和统计口径。
- `docs/ai-card-generation.md`：AI 卡片生成输入输出、来源校验和自动入库策略。

仍需后续单独细化：

- PDF 解析与来源定位契约。
- `pdfjs-dist` 阅读器工程设计。
- Provider adapter 设计。
- Cards 模块数据与交互契约。
- UI 重设计 brief。

优先级中等：

- PDF 解析策略。
- PDF 阅读页交互设计。
- 学习统计计算口径。
- 错误处理与用户提示规范。
- 历史模块清理计划。
- README 更新计划。

这些文档应服务实现，不应反过来扩大 MVP 范围。

## 20. 当前边界总结

XueJian 第一阶段要做的是：

```text
本地 PDF 学习资料 -> 可追踪卡片 -> 分组组织 -> 每日复习 -> 学习反馈
```

第一阶段不要把重点放在：

- 通用 AI 聊天。
- 全功能 PDF 阅读器。
- 完整 Anki 替代品。
- 多媒体内容生成平台。
- 云同步知识库。
- 积分激励系统。

当前仓库已有不少实现，但未来路线不是“照单全收”。正确策略是：

```text
复用底座 -> 冻结超前功能 -> 重设 UI 和目录边界 -> 跑通主闭环 -> 再按路线解冻扩展能力
```

只要主闭环稳定，后续 RAG、播客、TTS、导出和更复杂的学习算法都可以自然扩展。反过来，如果主闭环不稳定，任何高级 AI 能力都会变成一次性演示功能，难以形成真正的学习产品。
