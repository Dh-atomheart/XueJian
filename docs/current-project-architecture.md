# 学笺 XueJian 当前项目架构说明

> 更新时间：2026-04-26  
> 适用范围：当前仓库架构。  
> 文档目标：说明当前项目的运行时分层、核心模块、数据流、存储边界和开发入口。

## 1. 项目定位

学笺 XueJian 是一个本地优先的桌面学习应用，围绕资料导入、阅读加工、RAG 问答、AI 卡片生成、间隔复习和播客生成构建学习闭环。

当前主链路为：

```text
资料导入
  -> 文档解析与阅读加工
  -> 文档检索 / RAG 问答
  -> AI 卡片生成
  -> FSRS 间隔复习
  -> AI 播客生成
```

项目采用 Tauri 桌面端架构。React 负责交互界面，Rust Host 负责本地事实源、安全边界、数据库、密钥和系统资源，Python Orchestration Service 负责文档解析、RAG、卡片生成、播客生成等 AI 工作流。用户通过 BYOK 方式接入模型服务，敏感凭据保存在本地 Stronghold 中。

## 2. 整体架构图

```text
+--------------------------------------------------------------------------------+
|                              XueJian Desktop App                                |
|                                                                                |
|  +------------------------------ React UI ----------------------------------+  |
|  | AppShell / Feature Pages / Components                                    |  |
|  | Home | Library | Reader | Card Studio | Review | Knowledge QA | Podcast |  |
|  | Settings | Profile                                                       |  |
|  +-------------------------------+------------------------------------------+  |
|                                  |                                             |
|                                  v                                             |
|  +--------------------- TypeScript Client Layer ----------------------------+  |
|  | TanStack Query | Zustand | services/gateway | Zod schemas | mock fallback |  |
|  +-------------------------------+------------------------------------------+  |
|                                  | Tauri IPC                                   |
|                                  v                                             |
|  +------------------------------ Rust Host ---------------------------------+  |
|  | commands/*                                                              |  |
|  |   documents | cards | knowledge | podcast | animation | settings         |  |
|  |   orchestration | points | logging                                      |  |
|  |                                                                            |  |
|  | db/* repositories                                                        |  |
|  |   SQLite + migrations + FTS + sqlite-vec                                 |  |
|  |                                                                            |  |
|  | Stronghold SecretStore | Filesystem | Workflow Runtime | Logs            |  |
|  |                                                                            |  |
|  | Host HTTP Gateway <-------------------------------+                       |  |
|  +-------------------------------+-------------------|----------------------+  |
|                                  | starts sidecar     | controlled tools       |
|                                  v                   |                       |
|  +---------------------- Python Orchestration Service ----------------------+  |
|  | server.py                                                               |  |
|  | workflows: document_parse | document_embedding | card_generation         |  |
|  |            knowledge_qa | podcast | card_animation                      |  |
|  | parsing: Docling / PyMuPDF                                              |  |
|  | providers: LiteLLM / LLM adapters / TTS / embedding runtime             |  |
|  | exports: APKG import/export | annotated PDF export                      |  |
|  +-------------------------------+------------------------------------------+  |
|                                  |                                             |
+----------------------------------|---------------------------------------------+
                                   |
                                   v
             +-----------------------------------------------+
             | External AI Providers                         |
             | OpenAI | Anthropic | Google | DeepSeek        |
             | OpenAI-compatible endpoints | TTS providers   |
             +-----------------------------------------------+
```

关键原则：

- 前端不直接调用外部模型 Provider。
- Python 不直接写 SQLite，也不持久化明文密钥。
- Rust Host 是本地数据、安全和工具调用边界。
- 长任务通过 workflow runs、events、checkpoints 记录和追踪。

## 3. 仓库结构

```text
XueJianProject/
├─ docs/                         # 项目文档、专题设计、审计记录
├─ examples/                     # 设计样例、简历材料等辅助资料
├─ logs/                         # 运行日志目录
├─ runtime/                      # 运行期烟测和临时产物
├─ scripts/                      # CI / 检查脚本
└─ xuejian/                      # 主应用工程
   ├─ src/                       # React + TypeScript 前端
   ├─ src-tauri/                 # Tauri 2 + Rust Host
   ├─ orchestration_service/     # Python AI 编排服务
   └─ tests/                     # 单测、服务测试、E2E 测试
```

主应用工程在 `xuejian/` 下。根目录保存项目级文档与辅助资料。

## 4. React 前端架构

前端位于 `xuejian/src/`，使用 React、TypeScript、Vite、Tailwind CSS、TanStack Query、Zustand 和 Zod。

```text
xuejian/src/
├─ App.tsx
├─ main.tsx
├─ components/
│  ├─ shell/                  # AppShell、导航、全局布局
│  ├─ ui/                     # 通用 UI 组件
│  ├─ documents/              # Reader、PDF、高亮、便签、导入组件
│  ├─ cards/                  # 卡片渲染、编辑、候选、动画预览
│  ├─ knowledge/              # 知识问答组件
│  ├─ learning/               # 复习组件
│  ├─ stats/                  # 学习统计
│  ├─ home/                   # 首页组件
│  └─ podcast/                # 播客播放器
├─ features/
│  ├─ dashboard/
│  ├─ documents/
│  ├─ cards/
│  ├─ review/
│  ├─ knowledge/
│  ├─ podcast/
│  ├─ profile/
│  └─ settings/
├─ queries/                   # TanStack Query hooks
├─ services/
│  ├─ gateway/                # Tauri IPC Gateway
│  ├─ learning/               # 学习算法服务
│  └─ renderer/               # PDF / DOCX / text 渲染服务
├─ store/                     # Zustand store
├─ types/                     # TypeScript 类型和 Zod schema
├─ design-system/             # 主题、tokens
└─ lib/                       # 通用工具、日志、反馈、几何计算
```

### 4.1 页面组织

当前应用通过 `AppShell` 与 UI store 中的 `activeNavItem` 切换主页面。主要页面包括：

- `HomePage`
- `LibraryPage`
- `ReaderPage`
- `CardStudioPage`
- `ReviewPage`
- `KnowledgeQaPage`
- `PodcastPage`
- `SettingsPage`
- `ProfilePage`

阅读器是特殊状态：当 `reader.documentId` 存在时，应用进入 `ReaderPage`，并根据 context rail 状态挂载 `StickyNotesPanel`。

### 4.2 前端数据访问

前端的数据访问路径为：

```text
Feature Page / Component
  -> queries/*
    -> services/gateway/*
      -> invokeWithSchema
        -> Tauri IPC command
```

`src/services/gateway/index.ts` 封装了：

- Tauri 环境检测。
- `invoke` 调用。
- `invokeWithSchema` 运行时 schema 校验。
- 非 Tauri 环境的 mock fallback。
- IPC 错误日志和前端反馈。

## 5. Rust Host 架构

Rust Host 位于 `xuejian/src-tauri/`，是本地事实源和安全边界。

```text
xuejian/src-tauri/src/
├─ lib.rs                     # Tauri 启动、插件、AppState、IPC 注册
├─ app_state.rs               # 全局 AppState
├─ commands/                  # Tauri IPC 命令层
├─ db/                        # SQLite repository 层
├─ gateway/                   # Host HTTP Gateway
├─ secrets/                   # Stronghold 密钥存储
└─ tasks/                     # Python orchestration sidecar 管理
```

### 5.1 Tauri 启动流程

`src-tauri/src/lib.rs` 完成启动编排：

1. 创建 session log 目录。
2. 初始化 dialog、shell、log 插件。
3. 初始化 SQLite 数据库并执行 migrations。
4. 初始化 Stronghold Secret Store。
5. 启动 Host HTTP Gateway。
6. 初始化 Python Orchestration Service。
7. 注册 Tauri IPC commands。
8. 应用退出时停止 Python sidecar。

### 5.2 Commands 层

`src-tauri/src/commands/` 是前端进入 Rust Host 的 IPC 边界。

```text
commands/
├─ documents.rs
├─ cards.rs
├─ knowledge.rs
├─ podcast.rs
├─ animation.rs
├─ settings.rs
├─ orchestration.rs
├─ points.rs
└─ logging.rs
```

Commands 层职责：

- 接收前端 IPC 请求。
- 解析 DTO 并做基础校验。
- 调用 repository 或 orchestration service。
- 转换返回 DTO。
- 将错误转换为前端可处理的消息。

### 5.3 DB Repository 层

`src-tauri/src/db/` 封装 SQLite 访问。

```text
db/
├─ mod.rs                     # Database 初始化、migration、sqlite-vec 注册
├─ document_repo.rs
├─ section_repo.rs
├─ vector_repo.rs
├─ card_repo.rs
├─ knowledge_qa_repo.rs
├─ podcast_repo.rs
├─ animation_repo.rs
├─ workflow_repo.rs
├─ settings_repo.rs
└─ points_repo.rs
```

数据库初始化策略：

- 数据库文件位于 Tauri `app_data_dir()/xuejian.db`。
- 启用 `PRAGMA foreign_keys = ON`。
- 启用 `journal_mode = WAL`。
- 使用 `refinery` 执行 `src-tauri/src/migrations/` 迁移。
- 启动时注册 `sqlite-vec` auto extension。

### 5.4 Stronghold 密钥边界

`src-tauri/src/secrets/` 使用 Tauri Stronghold 保存用户 Provider Credentials。

约束：

- 前端只在输入阶段短暂持有 API Key。
- SQLite 只保存 provider、protocol、base URL、默认模型、key 状态等元数据。
- 列表接口不返回明文 key。
- Python 服务不持久化明文 key。

### 5.5 Host HTTP Gateway

`src-tauri/src/gateway/host_http.rs` 启动绑定到 `127.0.0.1` 的轻量 HTTP 服务，供 Python sidecar 调用。

职责：

- 向 Python 暴露受控工具。
- 读取文档、section、chunk、anchor。
- 执行知识检索。
- 提供模型配置、workflow assignment、embedding profile。
- 提供短时可用的 Provider 调用信息。
- 写入 workflow event、checkpoint、卡片候选、播客状态等。

该 Gateway 是 Rust Host 与 Python 编排层之间的工具边界。

### 5.6 Orchestration Sidecar 管理

`src-tauri/src/tasks/orchestration_service.rs` 负责：

- 定位 Python orchestration 脚本。
- 探测可用 Python runtime。
- 分配本地端口。
- 启动 `orchestration_service/server.py` 子进程。
- 注入 Host Gateway port。
- 检查 `/health`。
- 提供 start / stop / restart / health 能力。

## 6. Python Orchestration Service 架构

Python 编排服务位于 `xuejian/orchestration_service/`。

```text
xuejian/orchestration_service/
├─ server.py                  # HTTP 服务入口
├─ main.py
├─ clients/
│  └─ host_gateway.py         # 调用 Rust Host Gateway
├─ providers/                 # LLM / embedding / TTS provider 适配
├─ workflows/                 # AI 工作流
├─ schemas/                   # Pydantic schema
├─ parsing/                   # 文档解析
├─ exports/                   # APKG / PDF 导入导出
└─ logging_config.py
```

### 6.1 HTTP 接口

`server.py` 当前主要接口：

- `GET /health`
- `GET /handshake`
- `POST /workflows/document-parse`
- `POST /workflows/document-embedding`
- `POST /workflows/card-generation`
- `POST /workflows/knowledge-qa`
- `POST /workflows/card-animation`
- `POST /workflows/podcast`
- `POST /exports/apkg`
- `POST /exports/annotated-pdf`
- `POST /imports/apkg`

### 6.2 Workflows

```text
orchestration_service/workflows/
├─ card_generation.py
├─ agent_card_generation.py
├─ document_embedding.py
├─ knowledge_qa.py
├─ podcast.py
├─ podcast_utils.py
└─ card_animation.py
```

主要职责：

- `document_parse`：解析 PDF / Markdown / TXT / DOCX 等文档，生成结构化内容。
- `document_embedding`：读取文档 chunk，生成并写入 embedding。
- `card_generation`：基于文档上下文生成学习卡片。
- `knowledge_qa`：基于文档检索结果生成带引用回答。
- `podcast`：生成提纲、脚本、评审状态、TTS 音频和拼接产物。
- `card_animation`：围绕卡片内容生成动画表达。

### 6.3 Providers 与 Schemas

`providers/` 负责外部能力适配：

- LLM runtime 和 LiteLLM 适配。
- Embedding runtime。
- TTS provider 路由。

`schemas/` 使用 Pydantic 约束结构化输出，与 TypeScript 类型、Zod schema、Rust DTO、SQLite migrations 共同构成跨语言契约。

## 7. 核心业务链路

### 7.1 文档导入与解析

```text
LibraryPage / ImportDocumentButton
  -> documents gateway
  -> Tauri documents command
  -> document_repo 创建 documents 记录
  -> run_document_parse_workflow
  -> Python /workflows/document-parse
  -> parsing/docling_pipeline.py
  -> HostGateway 持久化 sections / chunks / anchors / analysis
```

当前能力：

- 文档列表和详情。
- PDF / 多格式导入入口。
- 文档解析 workflow。
- 文档 embedding workflow。
- 文档 sections / chunks / anchors 查询。
- 文档二进制读取。
- 删除文档。

### 7.2 阅读与标注

```text
components/documents/
├─ PdfViewer/
│  ├─ PdfToolbar.tsx
│  ├─ PdfSearchBar.tsx
│  ├─ PdfPageCanvas.tsx
│  ├─ PdfTextLayer.tsx
│  └─ HighlightLayer.tsx
├─ StickyNotes/
├─ TextSelectionPopover.tsx
├─ HighlightColorPicker.tsx
└─ PageNavBar.tsx
```

能力：

- PDF 渲染。
- 文本选择。
- 高亮标注。
- 便签。
- 页面导航和搜索。
- 与卡片生成、来源 anchor 的联动基础。

### 7.3 RAG 知识问答

```text
KnowledgeQaPage
  -> knowledge gateway
  -> Tauri knowledge command
  -> knowledge_qa_repo / workflow_repo
  -> Python /workflows/knowledge-qa
  -> HostGateway 检索文档 chunks / sections
  -> LLM 生成 answer + citations
  -> 前端展示问答和引用
```

当前能力：

- 知识搜索。
- QA conversation 管理。
- QA message 发送和取消。
- knowledge QA workflow 启动。
- 回答与引用结果展示。

### 7.4 卡片生成与复习

```text
CardStudioPage / Reader selection
  -> cards gateway
  -> Tauri cards command
  -> workflow_repo 创建 workflow_run
  -> Python /workflows/card-generation
  -> HostGateway 读取文档上下文
  -> LLM / rule fallback 生成
  -> card_repo 持久化候选或正式 cards
  -> ReviewPage 使用 FSRS 复习
```

当前能力：

- 卡片 CRUD。
- 到期卡片查询。
- 卡片候选查询与状态更新。
- 卡片生成 workflow 启动、恢复、完成。
- CSV / APKG 导入导出。
- 卡片媒体上传和管理。
- FSRS 复习日志、学习统计、热力图。

### 7.5 播客生成

```text
PodcastPage
  -> podcast gateway
  -> Tauri podcast command
  -> podcast_repo / workflow_repo
  -> Python /workflows/podcast
  -> 检索资料、生成提纲、生成脚本、评估、TTS、音频拼接
  -> podcast_episodes / podcast_audio_segments
```

当前能力：

- 启动播客 workflow。
- 获取 episode。
- 列出 episodes。
- 取消、删除、重试 episode。
- 审阅脚本。
- 获取 audio segments。

### 7.6 BYOK 与设置

```text
SettingsPage / ByokBootstrap
  -> settings gateway
  -> Tauri settings commands
  -> settings_repo + SecretStore
  -> Provider metadata / model discovery / workflow assignment
```

当前能力：

- API config CRUD。
- API Key 存储、删除、解锁、锁定和 vault 状态。
- Provider 连接测试。
- Provider 模型发现。
- Workflow assignment。
- Model profile。
- Embedding profile。
- Provider budget usage。
- legacy BYOK migration bootstrap。

## 8. 数据存储架构

### 8.1 SQLite

SQLite 是当前本地结构化数据的主要事实源，承载：

- 文档元数据。
- 文档 sections、chunks、anchors。
- 卡片、候选卡片、复习日志、媒体。
- 高亮和标注。
- 知识问答 conversation / message。
- 播客 episodes 和 audio segments。
- 工作流 runs、events、checkpoints。
- Provider configs、workflow assignments、embedding profiles、budget usage。
- 积分 ledger。

### 8.2 FTS 与 sqlite-vec

数据库层注册了 `sqlite-vec` extension，并通过 `vector_repo.rs` 管理向量相关数据。FTS、向量索引、sections、chunks 共同支撑文档检索和 RAG 工作流。

### 8.3 Stronghold

Stronghold 保存敏感凭据。数据库仅保存密钥状态和配置元数据。

### 8.4 文件系统

文件系统用于：

- 导入文档本体。
- PDF / 文档渲染读取。
- 导出 CSV、APKG、带标注 PDF。
- 播客音频文件和运行产物。
- session 日志和 smoke 报告。

## 9. Workflow Runtime

长任务统一通过 workflow 结构跟踪：

- `workflow_runs`：任务实例和最终状态。
- `workflow_events`：任务阶段、错误、进度和关键事件。
- `workflow_checkpoints`：恢复点和中间状态。

覆盖链路：

- 文档解析。
- 文档 embedding。
- 卡片生成。
- 知识问答。
- 播客生成。
- 卡片动画。

## 10. 跨层契约

项目同时使用多种契约机制：

- TypeScript 类型：`src/types/`
- Zod schema：前端 gateway 和测试侧运行时校验。
- Rust DTO：Tauri commands 输入输出。
- Pydantic schema：Python structured output 和 workflow artifact。
- SQLite migration：持久化结构契约。

开发规则：

1. 新增 IPC 命令时，同时补齐 TypeScript gateway、Zod schema、Rust DTO 和测试。
2. 新增 workflow artifact 时，同时补齐 Pydantic schema、HostGateway 方法和持久化字段。
3. 前端不绕过 gateway 直接调用命令字符串。
4. Python 不绕过 HostGateway 直接访问 SQLite 或 Stronghold。

## 11. 日志与可观测性

### 11.1 Rust / Tauri 日志

Tauri 启动时创建 session log 目录：

```text
logs/YYYY-MM-DD[HH-MM-SS]/
```

日志通过 `tauri-plugin-log` 输出到文件和 stdout。Rust panic hook 会记录 panic 位置和信息。

### 11.2 前端日志

`services/gateway/index.ts` 在 IPC 调用失败、慢命令等场景记录 request id、command、duration、error code，并通过 `appFeedback` 上报反馈。

### 11.3 Python 日志

Python orchestration 使用 `logging_config.py` 初始化日志。`server.py` 对每个 HTTP 请求记录 path、status code 和 duration。

### 11.4 Workflow 事件

解析、embedding、生成、问答、播客等长任务应写入 workflow run / event / checkpoint，方便排查失败和回放执行过程。

## 12. 测试结构

```text
xuejian/tests/
├─ unit/                       # 前端组件和业务单测
├─ services/                   # 服务层 / gateway / renderer 测试
├─ store/                      # Zustand store 测试
├─ types/                      # 类型和 schema 测试
├─ e2e/                        # Playwright E2E
└─ acceptance/                 # 验收说明
```

常用命令：

```bash
cd xuejian
npm run test
npm run test:e2e
npm run build
npm run lint
npm run smoke:native
```

Rust 侧 native smoke 会通过真实 Tauri AppState、Rust commands、orchestration service 和数据库路径验证关键链路。

## 13. 当前关键技术栈

### 前端

- React 19
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Zustand
- Zod
- Radix UI
- Lucide React
- pdfjs-dist
- Framer Motion
- ts-fsrs

### Rust Host

- Tauri 2
- rusqlite
- sqlite-vec
- refinery
- tauri-plugin-stronghold
- tauri-plugin-dialog
- tauri-plugin-shell
- tauri-plugin-log
- Tokio
- reqwest

### Python Orchestration

- LangChain
- LiteLLM
- Pydantic / PydanticAI
- OpenAI SDK
- Anthropic / Google adapters
- Docling
- PyMuPDF
- genanki
- edge-tts
- pydub
- ElevenLabs / Fish Audio SDK adapters

## 14. 架构边界与约束

1. SQLite 是本地结构化事实源。
2. Stronghold 是密钥事实源。
3. Python 只做 AI 编排，通过 HostGateway 访问受控资源。
4. 前端只做交互和呈现，通过 gateway 和 query 层访问数据。
5. 长任务必须可观测，写入 workflow run / event / checkpoint。
6. Fallback 必须显式标记，不能伪装为正常模型输出。
7. 跨语言契约必须同步维护。
8. 已删除的功能不应继续出现在导航、页面、主链路和架构文档中。

## 15. 典型开发入口

### 15.1 新增前端页面能力

1. 在 `src/features/*` 或 `src/components/*` 增加 UI。
2. 在 `src/services/gateway/*` 增加 gateway 方法。
3. 在 `src/queries/*` 增加 Query / Mutation。
4. 如需后端能力，在 Rust `commands/*` 增加 IPC。
5. 增加单测或 E2E 覆盖。

### 15.2 新增 Rust 本地能力

1. 在 `src-tauri/src/db/*_repo.rs` 增加 repository 方法。
2. 如需 schema 变化，在 `src-tauri/src/migrations/` 增加 migration。
3. 在 `src-tauri/src/commands/*` 增加 IPC command。
4. 在 `lib.rs` 的 `invoke_handler` 注册 command。
5. 在前端 gateway 中增加对应调用和 schema 校验。

### 15.3 新增 AI workflow

1. 在 `orchestration_service/workflows/` 增加 workflow。
2. 在 `server.py` 暴露 endpoint。
3. 在 HostGatewayClient 中增加需要的 Host 工具。
4. 在 Rust Host Gateway 中增加受控路由。
5. 在 Rust commands 中增加启动、状态、取消命令。
6. 写入 workflow_runs、events、checkpoints。
7. 补齐测试和 smoke 路径。

## 16. 与专题文档的关系

本文提供当前项目架构总览。更详细的子系统规则参考：

- `docs/byok-system.md`
- `docs/card-system-v2.md`
- `docs/podcast-generation-workflow.md`
- `docs/agent-driven-document-to-card-workflow.md`
- `docs/frontend-system-extension.md`
- `docs/pdf-annotation-system.md`

如果专题文档与当前代码存在差异，应先确认当前代码真实边界，再决定是更新实现还是修正文档。
