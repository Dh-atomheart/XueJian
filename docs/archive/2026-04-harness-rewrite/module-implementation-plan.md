# 学笺(XueJian)模块实施计划

本文档基于 `spec.md` 规范，为每个功能模块提供详细的实施计划。桌面端默认视觉基线在 MVP 即落地，统一采用“极简学术感 + 中度手绘漫画风格”，V4 只扩展主题切换与附加主题包能力。AI 编排相关边界统一服从 [ai-architecture-decision.md](./ai-architecture-decision.md)。

---

## 目录

- [MVP阶段模块](#mvp阶段模块)
  - [M1. 平台基础模块](#m1-平台基础模块)
  - [M2. 文档导入与锚点模块](#m2-文档导入与锚点模块)
  - [M3. 卡片生产线模块](#m3-卡片生产线模块)
  - [M4. 阅读与贴笺模块](#m4-阅读与贴笺模块)
  - [M5. 学习调度模块](#m5-学习调度模块)
  - [M6. BYOK与最小统计模块](#m6-byok与最小统计模块)
- [V2阶段模块](#v2阶段模块)
  - [V2-1. 知识库问答模块](#v2-1-知识库问答模块)
  - [V2-2. 积分系统模块](#v2-2-积分系统模块)
  - [V2-3. 多格式文档导入模块](#v2-3-多格式文档导入模块)
- [V3阶段模块](#v3阶段模块)
  - [V3-1. 卡片动画生成模块](#v3-1-卡片动画生成模块)
  - [V3-2. AI播客生成模块](#v3-2-ai播客生成模块)
- [V4阶段模块](#v4阶段模块)
  - [V4-1. 知识图谱模块](#v4-1-知识图谱模块)
  - [V4-2. 主题切换与扩展主题模块](#v4-2-主题切换与扩展主题模块)
  - [V4-3. Android能力适配评估模块](#v4-3-android能力适配评估模块)

---

## 拆分文档导航

为便于实施，本总文档之外还提供了按阶段拆分的模块实施文档，统一存放在 [docs/module-implementation](./module-implementation/README.md)。

**文档职责约定：**

- [ai-architecture-decision.md](./ai-architecture-decision.md) 负责 AI 编排架构、协议复用和 LangChain / LangGraph 定位
- [spec.md](./spec.md) 负责产品目标、架构边界、阶段定义和全局约束
- 本文档负责总览、总任务、跨模块依赖关系和阶段排期
- `docs/module-implementation/**` 负责每个模块的详细实施底稿，包括子任务拆分、数据流、接口契约、改动路径、异常边界和测试矩阵
- 若总文档与模块子文档的实施细节冲突，以模块子文档为实施准；若与 `spec.md` 的阶段边界冲突，以 `spec.md` 为准

**阅读顺序建议：**

1. 先阅读 [docs/module-implementation/README.md](./module-implementation/README.md)
2. 再进入对应阶段的 `README.md`
3. 最后阅读具体模块实施文档

**阶段索引：**

- [MVP阶段实施文档](./module-implementation/mvp/README.md)
- [V2阶段实施文档](./module-implementation/v2/README.md)
- [V3阶段实施文档](./module-implementation/v3/README.md)
- [V4阶段实施文档](./module-implementation/v4/README.md)

---

## MVP阶段模块

### M1. 平台基础模块

**优先级：P0 | 阶段：MVP | 预计工时：第1周**

#### 1.1 模块目标

建立桌面端本地优先应用骨架，确保数据库、文件、密钥、后台任务和日志能力稳定可用，为后续V2-V4阶段复用统一的数据层、模型层和任务层，并在 MVP 阶段同步落地默认设计系统、桌面壳层与基础视觉规范。

#### 1.2 关键任务清单

| 任务ID | 任务名称 | 技术实现 | 负责层 | 状态 |
|--------|----------|----------|--------|------|
| M1-T1 | 项目初始化 | Tauri 2 + React 19 + Vite + TypeScript | 全栈 | 待开始 |
| M1-T2 | 配置设计系统基础设施 | Tailwind CSS + Radix Primitives + primitives目录 | 前端 | 待开始 |
| M1-T3 | 建立默认设计Token与视觉基线 | CSS变量 + 纸感纹理 + 手绘线条规则 + 桌面壳层 | 前端 | 待开始 |
| M1-T4 | SQLite数据库初始化 | rusqlite + bundled feature | Rust | 待开始 |
| M1-T5 | 数据库迁移脚本实现 | 版本化迁移 + 回滚支持 | Rust | 待开始 |
| M1-T6 | FTS5全文索引配置 | SQLite FTS5 virtual table | Rust | 待开始 |
| M1-T7 | Stronghold密钥存储封装 | tauri-plugin-stronghold | Rust | 待开始 |
| M1-T8 | 基础Repository层实现 | 泛型仓库模式 + DTO转换 | Rust | 待开始 |
| M1-T9 | Tauri命令桥接层 | #[tauri::command] 宏 | Rust | 待开始 |
| M1-T10 | 前端服务层封装 | gateway/ 调用Tauri命令 | 前端 | 待开始 |

#### 1.3 目录结构

```
src-tauri/src/
├── commands/
│   ├── mod.rs
│   ├── documents.rs
│   ├── models.rs
│   └── settings.rs
├── db/
│   ├── mod.rs
│   ├── connection.rs      # SQLite连接池
│   ├── migrations/        # 迁移脚本
│   │   ├── V001_initial.rs
│   │   └── V002_fts5.rs
│   └── repositories/
│       ├── mod.rs
│       ├── document_repo.rs
│       ├── card_repo.rs
│       └── stats_repo.rs
├── secrets/
│   ├── mod.rs
│   └── stronghold.rs      # Stronghold封装
└── lib.rs

src/
├── design-system/
│   ├── tokens.ts
│   ├── theme.ts
│   ├── surfaces.ts
│   └── motion.ts
├── assets/
│   ├── fonts/
│   │   ├── Xiaolai-Regular.ttf
│   │   ├── yozai.woff2
│   │   └── lxgw-wenkai.woff2
│   └── textures/
│       ├── paper-grain.png
│       └── scribble-overlay.png
├── components/
│   ├── primitives/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Divider.tsx
│   │   └── Panel.tsx
│   └── shell/
│       ├── AppShell.tsx
│       ├── SidebarRail.tsx
│       ├── TopBar.tsx
│       └── ContextPanel.tsx
├── services/
│   └── gateway/
│       ├── index.ts
│       ├── documents.ts
│       ├── models.ts
│       └── settings.ts
├── types/
│   ├── document.ts
│   ├── card.ts
│   └── stats.ts
└── store/
    └── index.ts           # Zustand store
```

#### 1.4 核心数据结构

```typescript
// 前端类型定义
interface ModelProfile {
  id: string
  provider: 'openai' | 'anthropic' | 'custom'
  name: string
  model: string
  baseUrl?: string
  budgetLimit?: number
  isDefault: boolean
}

interface WorkflowRun {
  id: string
  type: 'card_generation'
  status: 'queued' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'
  checkpointRef?: string
  startedAt?: Date
  finishedAt?: Date
}

interface ThemeTokens {
  colors: {
    paperBase: string
    ink: string
    inkMuted: string
    inkSoft: string
    lineSoft: string
  }
  typography: {
    fontDisplay: string
    fontUi: string
    fontBody: string
    fontLatinMeta: string
  }
  spacing: Record<string, string>
  borders: Record<string, string>
  shadows: Record<string, string>
  textures: {
    paperGrain: string
    scribbleOverlay: string
  }
  iconStyle: 'hand-drawn-monoline'
}

interface SketchStyle {
  lineWeight: 'hairline' | 'thin' | 'medium'
  roughness: number
  underlineStyle: 'pencil' | 'marker'
  scribbleOpacity: number
}

type SurfaceVariant = 'canvas' | 'panel' | 'paperCard' | 'stickyNote' | 'toolbar' | 'modal'

type PageShellVariant = 'dashboard' | 'library' | 'reader' | 'review' | 'settings'
```

```rust
// Rust DTO定义
#[derive(Debug, Serialize, Deserialize)]
pub struct ModelProfileDto {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub model: String,
    pub base_url: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkflowRunDto {
    pub id: String,
    pub workflow_type: String,
    pub status: String,
    pub checkpoint_ref: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}
```

#### 1.5 技术实现要点

**数据库层：**
- 使用 `rusqlite` 的 bundled feature 避免系统依赖
- 连接池使用单连接 + Mutex，适合桌面应用
- 迁移脚本存于 `migrations/` 目录，按版本号执行
- FTS5 索引使用 content rowid 外键关联

**密钥存储：**
- Stronghold 文件存放于应用数据目录
- 提供 `save_key(id, key)` 和 `load_key(id)` 两个核心方法
- 数据库只存储 key id 引用，不存储明文

**命令桥接：**
- 每个 Tauri 命令保持薄层，只做输入输出校验
- 错误统一转换为 `Result<T, String>` 格式
- 前端通过 `@tauri-apps/api` 的 invoke 调用

**默认设计系统：**
- MVP 默认视觉语言固定为“极简学术感 + 中度手绘漫画风格”，不等待 V4 再定义
- 默认字体槽位固定为 `Kose / Xiaolai-Regular.ttf`、`Yozai`、`LXGW WenKai`、`Inter`
- 默认基准色值固定为 `#fbfbf9 / #1a1a1a / #666666 / #a0a0a0 / #e5e5e0`
- 页面壳层统一为左侧导航轨、主画布、上下文侧栏的桌面结构，不复刻手机单栏布局
- 手绘线条、分隔线、按钮边框和纸张纹理全部通过 Token 与 primitives 收口，禁止页面各自硬编码风格

#### 1.6 验收标准

- [ ] 应用可正常启动并显示主界面
- [ ] SQLite 数据库文件正确创建于应用数据目录
- [ ] 所有迁移脚本执行成功，表结构正确
- [ ] FTS5 索引可用，支持中文全文检索
- [ ] Stronghold 密钥存储和读取正常
- [ ] 前端可通过 gateway 调用 Rust 命令
- [ ] 字体加载成功，默认字体槽位可在页面壳层和基础控件中复用
- [ ] 设计Token、纸感纹理、手绘细墨线和桌面壳层完成落地
- [ ] 基础控件不退回默认模板风格
- [ ] 单元测试覆盖率 > 80%

#### 1.7 测试用例

| 测试ID | 测试内容 | 预期结果 |
|--------|----------|----------|
| M1-UT-01 | SQLite连接初始化 | 连接成功，返回有效句柄 |
| M1-UT-02 | 迁移脚本执行 | 所有表创建成功 |
| M1-UT-03 | FTS5索引创建 | 可执行全文检索 |
| M1-UT-04 | Stronghold密钥存储 | 密钥可保存和读取 |
| M1-UT-05 | 命令桥接调用 | 前端可成功调用Rust命令 |
| M1-UT-06 | 默认主题Token加载 | 返回固定色值、字体槽位和纹理资源 |
| M1-UT-07 | 桌面壳层渲染 | 左侧导航轨、主画布、上下文侧栏结构正确 |

---

### M2. 文档导入与锚点模块

**优先级：P0 | 阶段：MVP | 预计工时：第3周**

#### 2.1 模块目标

支持上传PDF、解析文本、建立页码和坐标锚点，为卡片生成和贴笺阅读提供稳定来源定位。

#### 2.2 关键任务清单

| 任务ID | 任务名称 | 技术实现 | 负责层 | 状态 |
|--------|----------|----------|--------|------|
| M2-T1 | 文件选择对话框 | tauri-plugin-dialog | Rust | 待开始 |
| M2-T2 | 文件复制到应用目录 | tauri-plugin-fs | Rust | 待开始 |
| M2-T3 | PDF.js集成 | pdfjs-dist | 前端 | 待开始 |
| M2-T4 | PDF文本层提取 | PDF.js getTextContent | 前端 | 待开始 |
| M2-T5 | PDF页面渲染 | PDF.js render + Canvas | 前端 | 待开始 |
| M2-T6 | 锚点数据结构设计 | page + paragraph + rects + quote | 共享 | 待开始 |
| M2-T7 | 文档元数据解析 | 页数、文件大小、内容hash | 前端+Rust | 待开始 |
| M2-T8 | 文档状态管理 | uploading → parsed → ready | 前端 | 待开始 |
| M2-T9 | 文档列表展示 | TanStack Query + 虚拟滚动 | 前端 | 待开始 |

#### 2.3 目录结构

```
src/
├── components/
│   └── documents/
│       ├── DocumentList.tsx
│       ├── DocumentCard.tsx
│       ├── DocumentUploader.tsx
│       └── DocumentStatusBadge.tsx
├── features/
│   └── documents/
│       ├── useDocumentUpload.ts
│       ├── useDocumentsQuery.ts
│       └── documentUtils.ts
├── services/
│   └── renderer/
│       ├── pdfRenderer.ts
│       └── textExtractor.ts

src-tauri/src/
├── commands/
│   └── documents.rs
├── db/repositories/
│   └── document_repo.rs
```

#### 2.4 核心数据结构

```typescript
// 文档实体
interface Document {
  id: string
  title: string
  filePath: string
  fileSize: number
  pageCount: number
  contentHash: string
  createdAt: Date
  status: 'uploading' | 'parsed' | 'indexing' | 'generating' | 'ready' | 'error'
}

// 文档锚点
interface DocumentAnchor {
  id: string
  documentId: string
  page: number
  paragraph: number
  textQuote: string
  rects: Array<{ x: number; y: number; width: number; height: number }>
  hash: string
}

// 文档分块（用于FTS5和后续RAG）
interface DocumentChunk {
  id: string
  documentId: string
  pageStart: number
  pageEnd: number
  chunkIndex: number
  content: string
  tokenCount: number
  metadata: Record<string, unknown>
}
```

#### 2.5 技术实现要点

**PDF处理流程：**
1. 用户选择文件 → 复制到应用目录
2. 创建 Document 记录（status: uploading）
3. PDF.js 加载文件 → 提取文本层
4. 生成文本分块 → 写入 DocumentChunk
5. 更新状态为 parsed

**锚点生成策略：**
- 使用 PDF.js 的文本项坐标信息
- 每个文本项包含：页面、transform 矩阵、文本内容
- 转换为统一的 rects 数组格式
- 生成 hash 用于锚点稳定性验证

**错误处理：**
- 文件类型错误：仅允许 .pdf
- 空文件：提示用户
- 损坏文件：标记 status 为 error，保留错误信息
- 大文件警告：超过 50MB 提示可能性能问题

#### 2.6 验收标准

- [ ] 可选择并上传PDF文件
- [ ] 文件正确复制到应用目录
- [ ] PDF正确渲染，文本层可选中
- [ ] 文本内容正确提取并分块
- [ ] 锚点数据正确生成和存储
- [ ] 文档列表正确展示
- [ ] 文档状态正确流转

#### 2.7 测试用例

| 测试ID | 测试内容 | 预期结果 |
|--------|----------|----------|
| U-DOC-001 | 上传有效PDF文件 | 返回Document对象，status='parsed' |
| U-DOC-002 | 上传非PDF文件 | 抛出InvalidFileTypeError |
| U-DOC-003 | 上传空文件 | 抛出EmptyFileError |
| U-DOC-004 | 上传损坏的PDF | 抛出CorruptedFileError |
| U-DOC-005 | 解析PDF提取文本 | 返回正确的文本内容和页数 |
| U-DOC-006 | 生成文本锚点 | 返回包含page、quote、rects的锚点 |

---

### M3. 卡片生产线模块

**优先级：P0 | 阶段：MVP | 预计工时：第2-3周**

#### 3.1 模块目标

从文档内容中生成卡片候选，经用户确认后入库为正式卡片，并支持后续编辑、删除和导出。

#### 3.2 关键任务清单

| 任务ID | 任务名称 | 技术实现 | 负责层 | 状态 |
|--------|----------|----------|--------|------|
| M3-T1 | Python orchestration service 基础设施 | Python service + LangChain | Host + Python | 待开始 |
| M3-T2 | Host-Service 协议封装 | RPC / event stream | Rust + Python | 待开始 |
| M3-T3 | 文档转卡片PresetWorkflow | 状态推进 + 审批点 | Python | 待开始 |
| M3-T4 | ModelGateway / ToolGateway 适配 | OpenAI/Anthropic适配 | Rust | 待开始 |
| M3-T5 | 文档分块策略 | 章节/段落/固定token | 前端 | 待开始 |
| M3-T6 | 卡片生成Prompt模板 | 结构化输出JSON | 前端 | 待开始 |
| M3-T7 | CardCandidate数据模型 | 候选表 + 去重逻辑 | Rust+前端 | 待开始 |
| M3-T8 | 用户确认界面 | 批量操作 + 编辑 | 前端 | 待开始 |
| M3-T9 | Checkpoint持久化 | SQLite存储中间状态 | Rust | 待开始 |
| M3-T10 | 任务恢复机制 | 从checkpoint恢复 | Rust+前端 | 待开始 |

#### 3.3 目录结构

```
src/
├── features/
│   └── agents/
│       ├── cardGeneration/
│       │   ├── workflowClient.ts  # 工作流客户端
│       │   ├── stages.ts          # 阶段定义
│       │   └── prompts.ts
│       └── agentTypes.ts
├── components/
│   └── cards/
│       ├── CardCandidateList.tsx
│       ├── CardCandidateItem.tsx
│       └── CardConfirmDialog.tsx

src-tauri/src/
├── gateway/
│   ├── mod.rs
│   ├── model_gateway.rs          # LLM调用网关
│   └── tool_gateway.rs           # 工具调用网关
├── tasks/
│   ├── mod.rs
│   ├── task_manager.rs           # 任务管理
│   └── checkpoint_store.rs       # Checkpoint存储

xuejian/python/
└── orchestration/
    ├── service.py                # Python服务入口
    ├── protocol.py               # Host-Service 协议
    └── presets/
        └── card_generation.py    # LangChain工作流
```

#### 3.4 核心数据结构

```typescript
// 卡片候选
interface CardCandidate {
  id: string
  documentId: string
  anchorId?: string
  front: string
  back: string
  tags: string[]
  confidence: number
  dedupeKey: string
  status: 'pending' | 'accepted' | 'rejected'
}

// 正式卡片
interface Card {
  id: string
  front: string
  back: string
  documentId: string
  anchorId?: string
  sourcePage: number
  sourceParagraph: number
  sourceCoordinates?: {
    x: number
    y: number
    width: number
    height: number
  }
  tags: string[]
  difficulty: number
  stability: number
  state: 'new' | 'learning' | 'review' | 'relearning'
  nextReview: Date
  createdAt: Date
  updatedAt: Date
}

// Agent运行记录
interface AgentRun {
  id: string
  presetId: string
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'
  threadId: string
  checkpointRef?: string
  costUsd?: number
  startedAt?: Date
  finishedAt?: Date
}
```

#### 3.5 Agent状态图设计

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   start     │────▶│   chunk     │────▶│  generate   │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   confirm   │◀── 人工确认点
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │    save     │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │    end      │
                                        └─────────────┘
```

#### 3.6 Prompt模板

```
你是一个专业的学习卡片生成助手。请根据以下文档内容生成问答卡片。

要求：
1. 每张卡片包含：问题（front）和答案（back）
2. 问题应简洁明确，答案应完整准确
3. 问题类型包括：概念解释、对比分析、应用场景等
4. 返回JSON格式：[{ "front": "问题", "back": "答案", "pageIndex": 页码 }]

文档内容：
{content}
```

#### 3.7 验收标准

- [ ] 可从文档启动卡片生成任务
- [ ] 任务进度可实时显示
- [ ] 生成的卡片候选可预览
- [ ] 用户可批量接受/拒绝/编辑候选
- [ ] 确认后的卡片正确入库
- [ ] 任务中断后可恢复
- [ ] 不会产生重复卡片
- [ ] 支持CSV和Anki格式导出

#### 3.8 测试用例

| 测试ID | 测试内容 | 预期结果 |
|--------|----------|----------|
| U-GEN-001 | 调用LLM生成卡片候选 | 返回符合Schema的CardCandidate数组 |
| U-GEN-002 | 空内容生成 | 返回空数组，不抛异常 |
| U-GEN-003 | 卡片结构验证 | 每张候选卡包含front、back、anchorId |
| U-GEN-004 | 分块逻辑测试 | 长文档正确分块，无内容丢失 |
| U-GEN-005 | 候选确认入库 | CardCandidate成功转换为正式Card |
| U-GEN-006 | 候选去重 | 相同dedupeKey的重复候选不会重复入库 |

---

### M4. 阅读与贴笺模块

**优先级：P0 | 阶段：MVP | 预计工时：第3周**

#### 4.1 模块目标

在桌面端阅读壳层中于中央阅读区旁显示本页关联卡片，形成"贴笺式"学习体验，支持卡片与原文的双向联动，同时保证纸感壳层与手绘细墨线语言覆盖工具栏、贴笺卡和高亮态。

#### 4.2 关键任务清单

| 任务ID | 任务名称 | 技术实现 | 负责层 | 状态 |
|--------|----------|----------|--------|------|
| M4-T1 | PDF渲染组件 | PDF.js + Canvas | 前端 | 待开始 |
| M4-T2 | PDF文本层叠加 | 文本选择 + 高亮 | 前端 | 待开始 |
| M4-T3 | 高亮图层实现 | SVG/Canvas覆盖层 | 前端 | 待开始 |
| M4-T4 | 卡片侧栏组件 | 按页码筛选显示 | 前端 | 待开始 |
| M4-T5 | 滚动联动机制 | 页码变化 → 卡片更新 | 前端 | 待开始 |
| M4-T6 | 点击跳转功能 | 卡片点击 → PDF定位 | 前端 | 待开始 |
| M4-T7 | 选中文本创建卡片 | 右键菜单 + 快速创建 | 前端 | 待开始 |
| M4-T8 | 高亮创建与编辑 | 拖拽选择 + 颜色选择 | 前端 | 待开始 |
| M4-T9 | 缩放后坐标映射 | 坐标转换计算 | 前端 | 待开始 |

#### 4.3 目录结构

```
src/
├── components/
│   └── documents/
│       ├── PdfViewer/
│       │   ├── index.tsx
│       │   ├── PdfCanvas.tsx
│       │   ├── TextLayer.tsx
│       │   ├── HighlightLayer.tsx
│       │   └── Toolbar.tsx
│       ├── StickyNotes/
│       │   ├── index.tsx
│       │   ├── CardSidebar.tsx
│       │   └── CardItem.tsx
│       └── Highlight/
│           ├── HighlightMenu.tsx
│           └── HighlightRenderer.tsx
├── features/
│   └── documents/
│       ├── usePdfViewer.ts
│       ├── useHighlights.ts
│       └── useStickyNotes.ts
├── services/
│   └── renderer/
│       └── coordinateMapper.ts
```

#### 4.4 UI布局设计

```
┌──────────────┬──────────────────────────────────┬───────────────────────┐
│ 左侧导航轨    │ 顶部细线工具栏 + 中央 PDF 阅读区     │ 右侧贴笺上下文栏         │
│ 学笺 / 文档 / │ 缩放、翻页、搜索、返回上次位置        │ 当前页卡片、手绘便签卡、  │
│ 学习 / 设置   │ 纸感背景上的正文保持最高可读性        │ 高亮摘要、快速新建卡片    │
└──────────────┴──────────────────────────────────┴───────────────────────┘
```

#### 4.5 核心数据结构

```typescript
// 高亮实体
interface Highlight {
  id: string
  cardId: string
  documentId: string
  pageNumber: number
  rectangles: Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  textContent: string
  color: string
  createdAt: Date
}

// PDF视口状态
interface PdfViewport {
  scale: number
  currentPage: number
  totalPages: number
  scrollPosition: { x: number; y: number }
}
```

#### 4.6 技术实现要点

**PDF渲染流程：**
1. PDF.js 加载文档，获取页面列表
2. 每页渲染为 Canvas + 文本层
3. 文本层使用 PDF.js 的 textContent API
4. 高亮层叠加在文本层上方

**坐标系统：**
- PDF 内部坐标：左下角为原点
- Canvas 坐标：左上角为原点
- 需要在两个坐标系之间转换
- 缩放时需要重新计算所有坐标

**双向联动：**
- 滚动 PDF → 更新 currentPage → 侧栏筛选卡片
- 点击卡片 → 计算 Y 坐标 → PDF 滚动到对应位置
- 选中文字 → 创建卡片 → 自动关联锚点

**视觉实现约束：**
- PDF 正文区域只允许极弱纸感纹理，禁止高噪声贴图和粗重装饰遮挡文本
- 贴笺卡、工具栏、分隔线和选中态统一使用手绘细墨线与纸片式表面
- 高亮态要清晰可见，但不得覆盖正文到影响阅读或选择

#### 4.7 验收标准

- [ ] PDF正确渲染，文本可选择
- [ ] 滚动时页码正确识别
- [ ] 侧栏卡片按当前页码筛选
- [ ] 点击卡片可跳转到对应位置
- [ ] 选中文本可创建卡片
- [ ] 高亮可创建、编辑、删除
- [ ] 缩放后高亮位置正确
- [ ] 高亮和卡片数据持久化
- [ ] 桌面阅读壳层一致，不卡回移动端式底部导航布局
- [ ] 贴笺卡视觉统一，且不遮挡正文阅读

#### 4.8 测试用例

| 测试ID | 测试内容 | 预期结果 |
|--------|----------|----------|
| U-STK-001 | 按页码获取卡片 | 返回指定页的所有卡片 |
| U-STK-002 | 坐标计算 | 缩放后卡片位置正确映射 |
| U-STK-003 | 卡片排序 | 按sourceParagraph正确排序 |
| U-HL-001 | 创建高亮区域 | 高亮正确显示在PDF上 |
| U-HL-002 | 高亮与卡片关联 | 点击高亮打开对应卡片 |
| U-HL-003 | 缩放后高亮位置 | 坐标正确映射，位置不变 |
| I-STK-001 | PDF渲染与卡片联动 | 滚动PDF时卡片列表正确更新 |
| I-STK-002 | 点击卡片跳转 | 点击卡片后PDF滚动到对应位置 |

---

### M5. 学习调度模块

**优先级：P0 | 阶段：MVP | 预计工时：第3周**

#### 5.1 模块目标

基于FSRS提供今日任务、翻卡学习、列表学习、复习评分与复习记录，并将桌面学习页设计为中央卡片舞台和低干扰状态条，而不是普通后台式卡片面板。

#### 5.2 关键任务清单

| 任务ID | 任务名称 | 技术实现 | 负责层 | 状态 |
|--------|----------|----------|--------|------|
| M5-T1 | ts-fsrs集成 | ts-fsrs包 | 前端 | 待开始 |
| M5-T2 | FSRS参数配置 | 默认参数 + 用户调整 | 前端 | 待开始 |
| M5-T3 | 今日任务计算 | 到期卡片 + 新卡上限 | 前端+Rust | 待开始 |
| M5-T4 | 翻卡学习界面 | 翻转动画 + 评分按钮 | 前端 | 待开始 |
| M5-T5 | 列表学习视图 | 虚拟滚动 + 筛选 | 前端 | 待开始 |
| M5-T6 | 评分处理逻辑 | FSRS算法调用 | 前端 | 待开始 |
| M5-T7 | ReviewLog持久化 | 写入SQLite | Rust | 待开始 |
| M5-T8 | 学习统计计算 | 日统计 + 正确率 | Rust | 待开始 |

#### 5.3 目录结构

```
src/
├── components/
│   └── learning/
│       ├── TodayView/
│       │   ├── index.tsx
│       │   ├── TaskSummary.tsx
│       │   └── StartLearningButton.tsx
│       ├── CardReview/
│       │   ├── index.tsx
│       │   ├── FlipCard.tsx
│       │   ├── RatingButtons.tsx
│       │   └── ProgressBar.tsx
│       └── ListView/
│           ├── index.tsx
│           └── CardListRow.tsx
├── features/
│   └── review/
│       ├── useFsrs.ts
│       ├── useTodayTasks.ts
│       └── useReviewSession.ts
├── services/
│   └── learning/
│       └── fsrsService.ts

src-tauri/src/
├── db/repositories/
│   └── review_log_repo.rs
```

#### 5.4 核心数据结构

```typescript
// FSRS评分
type Rating = 'again' | 'hard' | 'good' | 'easy'

// 复习记录
interface ReviewLog {
  id: string
  cardId: string
  rating: Rating
  reviewedAt: Date
  state: 'new' | 'learning' | 'review' | 'relearning'
  difficulty: number
  stability: number
  retrievability: number
  nextReview: Date
  intervalDays: number
}

// 今日任务
interface TodayTasks {
  reviewCount: number      // 今日到期复习数
  newCount: number         // 今日新卡数
  totalEstimate: number    // 预计学习时间（分钟）
}

// 学习会话状态
interface ReviewSession {
  cards: Card[]
  currentIndex: number
  startTime: Date
  stats: {
    again: number
    hard: number
    good: number
    easy: number
  }
}
```

#### 5.5 FSRS算法集成

```typescript
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'

// 初始化FSRS
const f = fsrs()

// 新卡片创建
const newCard = createEmptyCard()

// 复习后更新
const result = f.repeat(card, new Date())
const schedulingCards = result[Rating.Good] // 获取Good评分后的调度结果

// 更新卡片状态
card.difficulty = schedulingCards.difficulty
card.stability = schedulingCards.stability
card.nextReview = schedulingCards.due
```

#### 5.6 学习界面设计

**翻卡学习视图：**
```
┌──────────────────────────────────────────────────────────┐
│ 顶部轻量状态条：今日任务 / 进度 / 预计时长               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                  中央卡片舞台                            │
│          纸片式卡片 + 细线边框 + 低干扰留白               │
│               [点击翻面或显示答案]                       │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [重来] [困难] [良好] [简单] 以手绘细线按钮呈现             │
└──────────────────────────────────────────────────────────┘
```

**视觉实现约束：**
- 卡片正文、答案和评分按钮优先保证可读性，不使用夸张手写体作为主要阅读字体
- 状态信息保持弱化展示，不使用重色块、多彩仪表盘或后台式边栏干扰学习焦点
- 列表学习页保留纸感壳层和手绘分隔线，但不做管理台风格大表格

#### 5.7 验收标准

- [ ] 可正确计算今日待复习卡片
- [ ] 可正确计算今日可学新卡
- [ ] 翻卡界面正常工作
- [ ] 四档评分按钮可用
- [ ] 评分后正确更新卡片状态
- [ ] ReviewLog正确持久化
- [ ] 列表视图支持筛选
- [ ] 列表视图支持虚拟滚动
- [ ] 学习舞台视觉聚焦，不出现后台列表式布局

#### 5.8 测试用例

| 测试ID | 测试内容 | 预期结果 |
|--------|----------|----------|
| U-FRS-001 | 新卡片首次复习 | state='learning'，计算nextReview |
| U-FRS-002 | Again评级 | stability降低，interval缩短 |
| U-FRS-003 | Easy评级 | stability增加，interval延长 |
| U-FRS-004 | retrievability计算 | 返回0-1之间的概率值 |
| U-FRS-005 | 今日到期卡片 | 返回nextReview <= today的卡片 |
| I-FRS-001 | 完整复习流程 | 评级后更新卡片状态和复习记录 |
| I-FRS-002 | 复习记录保存 | ReviewLog正确保存到数据库 |

---

### M6. BYOK与最小统计模块

**优先级：P0 | 阶段：MVP | 预计工时：第4周**

#### 6.1 模块目标

允许用户配置自有模型凭证，并查看最小可用学习反馈，同时保证设置页与统计页沿用同一纸感壳层和克制概览风格，不演变为企业后台驾驶舱。

#### 6.2 关键任务清单

| 任务ID | 任务名称 | 技术实现 | 负责层 | 状态 |
|--------|----------|----------|--------|------|
| M6-T1 | API配置界面 | 表单 + 验证 | 前端 | 待开始 |
| M6-T2 | API Key安全存储 | Stronghold | Rust | 待开始 |
| M6-T3 | 连接测试功能 | 发送测试请求 | Rust | 待开始 |
| M6-T4 | OpenAI适配器 | openai SDK | Rust | 待开始 |
| M6-T5 | Anthropic适配器 | anthropic SDK | Rust | 待开始 |
| M6-T6 | 自定义端点适配器 | OpenAI兼容API | Rust | 待开始 |
| M6-T7 | Token消耗统计 | 请求/响应解析 | Rust | 待开始 |
| M6-T8 | 费用估算 | 按模型定价计算 | Rust+前端 | 待开始 |
| M6-T9 | 热力图组件 | 日统计可视化 | 前端 | 待开始 |
| M6-T10 | 统计数据计算 | SQLite聚合查询 | Rust | 待开始 |

#### 6.3 目录结构

```
src/
├── components/
│   ├── settings/
│   │   ├── ApiConfigForm.tsx
│   │   ├── ModelSelector.tsx
│   │   └── ConnectionTest.tsx
│   └── stats/
│       ├── Heatmap.tsx
│       ├── TodaySummary.tsx
│       └── MasteryDistribution.tsx
├── features/
│   └── settings/
│       ├── useApiConfig.ts
│       └── useConnectionTest.ts

src-tauri/src/
├── gateway/
│   └── model_gateway.rs
├── secrets/
│   └── stronghold.rs
├── db/repositories/
│   └── stats_repo.rs
```

#### 6.4 核心数据结构

```typescript
// API配置
interface APIConfig {
  id: string
  provider: 'openai' | 'anthropic' | 'custom'
  name: string
  apiKey: string        // 仅在编辑时存在，不持久化到SQLite
  baseUrl?: string
  model: string
  isDefault: boolean
}

// 日统计
interface DailyStats {
  date: Date
  newCards: number
  reviewCards: number
  learningTime: number
  correctRate: number
}

// 热力图数据
interface HeatmapData {
  date: Date
  count: number
  level: 0 | 1 | 2 | 3 | 4  // 颜色深度级别
}
```

#### 6.5 密钥存储流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 用户输入Key │────▶│ 前端不存储  │────▶│ 调用Rust命令│
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Stronghold │
                                        │  加密存储   │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ SQLite只存  │
                                        │ key_id引用  │
                                        └─────────────┘
```

#### 6.6 桌面视觉说明

- 设置页使用纸感面板、细线表单边框、手绘分隔线和克制留白
- 模型选择器、连接测试和预算提示保持同一字体槽位，不引入额外主题分支
- 统计页仅展示最小必要信息：今日张数、学习时长、基础热力图、掌握度概览
- 禁止使用多彩图表墙、重装饰插画或高对比纹理干扰设置与反馈理解

#### 6.7 验收标准

- [ ] 可配置多个API提供商
- [ ] API Key安全存储于Stronghold
- [ ] 可测试API连接
- [ ] 支持OpenAI、Anthropic、自定义端点
- [ ] Token消耗可统计
- [ ] 费用可估算
- [ ] 热力图正确显示学习记录
- [ ] 今日统计正确计算
- [ ] 最小统计页保持克制概览，而非数据驾驶舱
- [ ] 设置页与主产品页风格连续，表单可读性稳定

#### 6.8 测试用例

| 测试ID | 测试内容 | 预期结果 |
|--------|----------|----------|
| U-API-001 | 保存API配置 | 元数据入库，API Key写入Stronghold |
| U-API-002 | 读取API配置 | 返回正确元数据，按需从Stronghold取回密钥 |
| U-API-003 | 删除API配置 | 数据库记录移除，Stronghold密钥同步删除 |
| U-API-004 | OpenAI连接测试 | 返回连接成功/失败状态 |
| U-API-005 | Anthropic连接测试 | 返回连接成功/失败状态 |
| U-API-006 | 日志脱敏 | 日志中不出现明文API Key |

---

## V2阶段模块

### V2-1. 知识库问答模块

**优先级：P1 | 阶段：V2 | 预计工时：第1-2周**

#### 模块目标

让用户可以选定文档、卡组或知识范围，基于本地知识库进行问答，并给出引用来源。

#### 关键任务

| 任务ID | 任务名称 | 技术实现 |
|--------|----------|----------|
| V2-1-T1 | 知识范围定义 | KnowledgeScope数据模型 |
| V2-1-T2 | FTS5检索增强 | BM25排序 + 元数据过滤 |
| V2-1-T3 | Embedding生成 | 可选：OpenAI embedding API |
| V2-1-T4 | 混合检索实现 | FTS5 + embedding召回融合 |
| V2-1-T5 | RAG Prompt构造 | 带引用的上下文组装 |
| V2-1-T6 | 引用解析与展示 | 锚点跳转 + 来源高亮 |
| V2-1-T7 | RAG会话管理 | RagSession持久化 |

#### 核心数据结构

```typescript
interface KnowledgeScope {
  id: string
  name: string
  documentIds: string[]
  cardGroupIds: string[]
  tags: string[]
  pageRanges?: { start: number; end: number }[]
  includeHighlights: boolean
}

interface RetrievalChunk {
  id: string
  documentId: string
  pageStart: number
  pageEnd: number
  content: string
  score: number
  embeddingId?: string
}

interface Citation {
  id: string
  documentId: string
  page: number
  anchorId?: string
  quote: string
}

interface RagSession {
  id: string
  scopeId: string
  query: string
  answer: string
  citations: Citation[]
  createdAt: Date
}
```

#### 验收标准

- [ ] 可创建和配置知识范围
- [ ] FTS5检索正常工作
- [ ] Embedding可选启用
- [ ] 混合检索支持降级
- [ ] 答案包含引用来源
- [ ] 引用可跳转到原文

---

### V2-2. 积分系统模块

**优先级：P1 | 阶段：V2 | 预计工时：第1周**

#### 模块目标

用轻量激励提高连续学习意愿，不改变学习主逻辑。

#### 关键任务

| 任务ID | 任务名称 | 技术实现 |
|--------|----------|----------|
| V2-2-T1 | 积分事件定义 | PointLedger数据模型 |
| V2-2-T2 | 积分规则配置 | 学习行为 → 积分映射 |
| V2-2-T3 | 防重复记账 | sourceId去重 |
| V2-2-T4 | 连续签到计算 | streak计算逻辑 |
| V2-2-T5 | 成就系统 | 简单里程碑触发 |
| V2-2-T6 | 积分展示UI | 头部积分显示 + 成就页面 |

#### 核心数据结构

```typescript
interface PointLedger {
  id: string
  userId: string
  delta: number
  reason: 'daily_review' | 'new_card' | 'streak' | 'milestone'
  sourceId?: string  // 防重复记账
  createdAt: Date
}

interface RewardEvent {
  id: string
  ledgerId: string
  title: string
  description: string
}
```

#### 验收标准

- [ ] 学习行为产生积分
- [ ] 同一事件不重复记账
- [ ] 连续签到正确计算
- [ ] 积分可在UI查看

---

### V2-3. 多格式文档导入模块

**优先级：P1 | 阶段：V2 | 预计工时：第2周**

#### 模块目标

将导入格式从PDF扩展到MD、TXT、DOCX，扩大资料来源。

#### 关键任务

| 任务ID | 任务名称 | 技术实现 |
|--------|----------|----------|
| V2-3-T1 | Markdown解析 | remark + rehype |
| V2-3-T2 | TXT文本解析 | 编码检测 + 段落分割 |
| V2-3-T3 | DOCX解析 | mammoth.js 或服务端转换 |
| V2-3-T4 | 统一文本结构 | 标准化ImportedDocument |
| V2-3-T5 | 降级锚点策略 | paragraph/text-range锚点 |
| V2-3-T6 | 格式识别与路由 | 文件扩展名检测 |

#### 核心数据结构

```typescript
interface ImportedDocument {
  id: string
  fileType: 'pdf' | 'md' | 'txt' | 'docx'
  title: string
  contentHash: string
  importStrategy: 'native' | 'converted'
  anchorMode: 'coordinate' | 'text-range' | 'paragraph'
}
```

#### 验收标准

- [ ] 可导入MD/TXT/DOCX文件
- [ ] 文本正确提取
- [ ] 锚点可定位（降级策略）
- [ ] 后续流程与PDF一致

---

## V3阶段模块

### V3-1. 卡片动画生成模块

**优先级：P2 | 阶段：V3**

#### 模块目标

将卡片内容转为可预览的可视化演示，优先支持数学、图形和概念过程类内容。

#### 关键任务

| 任务ID | 任务名称 | 技术实现 |
|--------|----------|----------|
| V3-1-T1 | 动画引擎选型 | p5.js / manim |
| V3-1-T2 | 内容分析工作流 | 识别适合动画的内容 |
| V3-1-T3 | 脚本生成Prompt | 结构化动画描述 |
| V3-1-T4 | 渲染执行环境 | 沙箱执行 + 资源隔离 |
| V3-1-T5 | 预览组件 | 嵌入式播放器 |
| V3-1-T6 | 资源管理 | AnimationJob + AnimationAsset |

#### 验收标准

- [ ] 可从卡片生成动画
- [ ] 动画可预览
- [ ] 失败可重试
- [ ] 资源可管理

---

### V3-2. AI播客生成模块

**优先级：P2 | 阶段：V3**

#### 模块目标

根据文档或卡片集合自动生成播客式学习材料，包括脚本和音频。

#### 关键任务

| 任务ID | 任务名称 | 技术实现 |
|--------|----------|----------|
| V3-2-T1 | 提纲生成工作流 | 知识点提取 + 结构化 |
| V3-2-T2 | 对话脚本生成 | 多角色对话设计 |
| V3-2-T3 | TTS集成 | OpenAI TTS / Edge TTS |
| V3-2-T4 | 音频拼接 | ffmpeg / Web Audio API |
| V3-2-T5 | 播客播放器 | 音频播放 + 进度同步 |
| V3-2-T6 | 长任务恢复 | Checkpoint + 恢复机制 |

#### 验收标准

- [ ] 可生成播客脚本
- [ ] 可生成音频
- [ ] 任务可恢复
- [ ] 预算可控制

---

## V4阶段模块

### V4-1. 知识图谱模块

**优先级：P3 | 阶段：V4**

#### 模块目标

从文档、卡片、问答与学习记录中提取知识节点和关系，提供结构化知识视图。

#### 关键任务

| 任务ID | 任务名称 | 技术实现 |
|--------|----------|----------|
| V4-1-T1 | 实体抽取工作流 | NER + 概念识别 |
| V4-1-T2 | 关系抽取 | 关系分类 + 置信度 |
| V4-1-T3 | 实体消歧 | 同义词合并 + 去重 |
| V4-1-T4 | 图谱存储 | SQLite节点/边表 |
| V4-1-T5 | 图谱可视化 | D3.js / Cytoscape.js |
| V4-1-T6 | 增量更新 | 新文档触发增量抽取 |

#### 验收标准

- [ ] 可构建知识图谱
- [ ] 节点可追溯来源
- [ ] 支持增量更新
- [ ] 实体消歧合理

---

### V4-2. 主题切换与扩展主题模块

**优先级：P3 | 阶段：V4**

#### 模块目标

在不改变 MVP 默认视觉基线的前提下，提供主题切换、扩展主题包和无障碍回退能力。

#### 关键任务

| 任务ID | 任务名称 | 技术实现 |
|--------|----------|----------|
| V4-2-T1 | ThemeProvider实现 | 默认主题 + 扩展主题包注册 |
| V4-2-T2 | 主题切换机制 | 设置持久化 + 运行时切换 |
| V4-2-T3 | 扩展主题包规范 | Token覆盖 + 资源映射 |
| V4-2-T4 | 默认主题回退 | 失败回退 + 无障碍主题 |
| V4-2-T5 | 可访问性回归 | 对比度 + 阅读效率 + 键盘导航 |

#### 验收标准

- [ ] 可在默认主题、扩展主题包和回退主题间切换
- [ ] 不影响阅读效率
- [ ] 业务组件接口不因主题切换而变化
- [ ] 默认主题回退能力可用

---

### V4-3. Android能力适配评估模块

**优先级：P4 | 阶段：V4**

#### 模块目标

评估并规划从桌面端过渡到Android时的能力边界、文件系统适配和交互调整。

#### 关键任务

| 任务ID | 任务名称 | 技术实现 |
|--------|----------|----------|
| V4-3-T1 | 能力矩阵盘点 | 桌面 vs 移动端能力对比 |
| V4-3-T2 | 阻塞项识别 | 技术限制 + 平台限制 |
| V4-3-T3 | 文件系统适配 | Android存储访问策略 |
| V4-3-T4 | 后台任务评估 | Android后台限制 |
| V4-3-T5 | 迁移方案文档 | 实施建议 + 风险清单 |

#### 验收标准

- [ ] 输出能力矩阵
- [ ] 识别阻塞项
- [ ] 形成迁移建议

---

## 附录：模块依赖关系图

```
M1(平台基础+设计系统) ──┬──▶ M2(文档导入) ──▶ M3(卡片生产线)
                      │
                      ├──▶ M4(阅读贴笺) ◀──┐
                      │                    │
                      └──▶ M5(学习调度) ◀──┤
                                           │
                      M6(BYOK统计) ────────┘

V2阶段依赖MVP:
V2-1(RAG) ◀── M2 + M3
V2-2(积分) ◀── M5
V2-3(多格式) ◀── M2

V3阶段依赖V2:
V3-1(动画) ◀── M3
V3-2(播客) ◀── V2-1

V4阶段依赖V3:
V4-1(图谱) ◀── V2-1 + V3-2
V4-2(主题扩展) ◀── M1(设计系统) + MVP全部
V4-3(Android) ◀── MVP全部
```

---

## 附录：技术栈速查

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端框架 | React 19 + TypeScript | UI组件 |
| 状态管理 | TanStack Query + Zustand | 数据缓存 + UI状态 |
| UI组件 | Radix Primitives + Tailwind | 无样式组件 + 原子CSS |
| PDF渲染 | PDF.js | 文档展示 |
| Markdown | react-markdown + remark | 内容渲染 |
| LaTeX | KaTeX | 公式渲染 |
| 学习算法 | ts-fsrs | FSRS调度 |
| AI编排层 | Python Orchestration Service + LangChain | 预设工作流编排 |
| 桌面框架 | Tauri 2.0 | 原生能力 |
| 数据库 | SQLite + FTS5 | 本地存储 |
| 密钥存储 | Stronghold | 安全存储 |
| 后端语言 | Rust | 核心服务 |
| 测试 | Vitest + Playwright | 单元 + E2E |

---

*文档版本：v1.1*
*创建日期：2026-04-16*
*基于：spec.md v3.2*
