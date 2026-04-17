# 学笺(XueJian)项目规范文档

## Spec Summary

### 当前文档用途

本文档既是产品/技术总规范，也是 AI agent 可直接执行的一线操作规范。阅读顺序遵循：

1. 先看 `Spec Summary`
2. 再看 `Commands`
3. 然后只进入当前要实现的阶段章节
4. 最后回查对应阶段的验收与边界

### 当前目标

- 构建一个本地优先的学习应用
- 用户上传文档后自动生成卡片
- 卡片贴在原文旁边进行学习
- 使用 FSRS 驱动复习
- 全程支持 BYOK，数据默认留在本地
- 桌面端默认采用“极简学术感 + 中度手绘漫画风格”视觉基线

### 当前阶段定义

- **当前实施重点：MVP**
- **MVP Done Means：**
  上传 PDF 后能够生成并确认卡片，卡片可在贴笺视图中与原文双向联动，用户可完成一次完整学习流程，并在本地看到真实学习反馈；数据库、密钥存储和长任务恢复机制可用；首页、阅读页、学习页和设置页共享统一的桌面端默认视觉语言。
- **V2 Done Means：**
  在不破坏 MVP 学习体验的前提下，支持知识库问答、多格式导入和积分系统，并提供可追溯引用与可审计记账。
- **V3 Done Means：**
  支持动画与播客类长任务，生成结果可预览、可恢复、可取消、可控预算。
- **V4 Done Means：**
  提供可信的知识图谱、主题切换与扩展主题包能力，并完成 Android 迁移能力评估，不以正式移动端上线为验收标准。

### 非目标

- 首版不做可视化工作流编排器
- 首版不做云端账户和多端同步
- 首版不交付 Android 应用
- 首版不等待 V4 再定义桌面端默认视觉系统
- V2-V4 规格用于约束接口与阶段目标，不视为当前立即实施项

### 快速命令索引

- 安装：`cd xuejian && npm install`
- 前端开发：`npm run dev`
- 前端构建：`npm run build`
- 前端检查：`npm run lint`
- 计划中的前端测试：`npm run test`
- 计划中的 E2E：`npm run test:e2e`
- 计划中的 Tauri 开发：`npm run tauri:dev`
- 计划中的 Tauri 构建：`npm run tauri:build`
- 计划中的 Rust 测试：`cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

### Agent 适用边界

- **当前要做什么：** 优先执行当前阶段章节、对应命令、对应验收
- **未来保留什么：** V2-V4 的接口和数据模型可以预留，但不得提前侵入 MVP 复杂度；桌面端默认视觉基线已在 MVP 锁定
- **什么必须先问人：** 改阶段边界、改 schema、改导出格式、引入大依赖、改变安全模型
- **什么绝不能做：** 写入明文密钥、跳过失败测试删除用例、绕过 Stronghold、把 IndexedDB 当主数据库、把默认视觉退回通用后台模板风

## Extended TOC

- `Spec Summary`：快速理解目标、阶段和边界
- [ai-architecture-decision.md](./ai-architecture-decision.md)：AI 编排架构决策、运行边界与跨端策略
- `一、项目概述`：愿景、用户、核心故事
- `二、功能规范`：按阶段展开的产品规格
- `Commands`：安装、开发、测试、构建、提交前检查
- `Code Style & Patterns`：React / TypeScript / Rust 的实现约束
- `Git Workflow`：分支、commit、PR 前检查
- `Agent Boundaries`：Always / Ask First / Never
- `三、技术架构规范`：架构、运行时、目录结构
- `四、数据模型规范`：核心类型、分阶段扩展类型、数据库 schema
- `五、分阶段验收与测试计划`：阶段验收标准和测试矩阵
- `六、开发实施计划`：各阶段计划和验收出口
- `七、约束条件`：技术、性能、业务和配置边界
- `八、风险与缓解措施`：主要风险及应对
- `九、下一步行动`：当前优先启动顺序

## 一、项目概述

### 1.1 项目背景

学笺是一个AI驱动的智能学习记忆应用，旨在帮助考研、考公、期末备考等需要重复性记忆知识的用户群体。通过大模型技术实现知识卡片自动生成、贴笺式文档学习、智能复习调度等功能，提升用户的学习效率。

### 1.2 核心价值主张

> **上传文档，一键生成卡片，卡片贴在原文旁边——像在书中贴便签一样学习。**

这一核心价值结合了两大优势：

- **消除手动录入痛苦**：上传PDF即可自动生成问答卡片，告别Anki式的手动创建
- **贴笺式学习体验**：卡片与原文关联，学习时有上下文参照，如同在真实书本中贴便签

### 1.3 目标用户

- 考研学生
- 考公备考者
- 期末备考大学生
- 需要系统性记忆知识的学习者

### 1.4 核心用户故事

**场景1：首次使用**

> 小李下载学笺，打开软件，输入自己的OpenAI API Key。上传一份考研政治PDF，等待约2分钟，系统生成了80张问答卡片。小李点击"开始学习"，进入贴笺视图——左边是PDF原文，右边是本页相关的卡片。

**场景2：日常学习**

> 小李每天打开学笺，首页显示"今日待复习：23张"。他点击进入学习模式，卡片翻转显示答案，他评价"记得/模糊/忘记"。系统自动计算下次复习时间。学完后，热力图上今天的位置变绿。

**场景3：补充卡片**

> 小李在PDF中选中一段话，右键"创建卡片"，手动填写问题和答案。新卡片出现在当前页的侧边栏。

---

## 二、功能规范

### 2.1 功能优先级矩阵（更新版）

| 优先级 | 功能模块                    | 实现难度 | 用户价值 | 开发阶段 |
| ------ | --------------------------- | -------- | -------- | -------- |
| P0     | 文档上传（PDF）             | 中       | 极高     | MVP      |
| P0     | LLM卡片生成                 | 中       | 极高     | MVP      |
| P0     | 卡片管理（CRUD）            | 低       | 极高     | MVP      |
| P0     | 贴笺式展示                  | 高       | 极高     | MVP      |
| P0     | FSRS学习调度                | 中       | 极高     | MVP      |
| P0     | 学习记录可视化              | 中       | 高       | MVP      |
| P0     | BYOK API管理                | 中       | 高       | MVP      |
| P1     | 知识库问答（RAG）           | 中       | 高       | V2       |
| P1     | 积分系统                    | 低       | 中       | V2       |
| P1     | 更多文档格式（MD/TXT/DOCX） | 中       | 中       | V2       |
| P2     | 卡片内容动画生成            | 高       | 中       | V3       |
| P2     | AI播客生成                  | 高       | 中       | V3       |
| P3     | 知识图谱                    | 高       | 中       | V4       |
| P4     | 移动端适配                  | 高       | 高       | 未来规划 |

**多智能体平台形态说明：**

- 首版采用**内置预设 Agent + 轻量配置**模式，不提供Dify式可视化工作流编排器
- 用户可配置项限定为：模型、知识源、提示词模板、工具开关、预算限制
- Agent能力优先服务现有学习闭环：文档转卡片、知识问答、播客脚本与音频生成

### 2.2 MVP阶段详细规格

MVP是首个可交付版本，目标是完整打通“上传文档 -> 生成卡片 -> 贴笺阅读 -> 学习复习 -> 查看反馈”的本地学习闭环。MVP阶段只支持PDF文档，不承诺知识库问答、多格式导入、播客、知识图谱与移动端交付。

**Done Means：**

- 用户可从 PDF 完成一次完整学习闭环
- 所有核心数据落在 SQLite，密钥存于 Stronghold
- 失败后可恢复卡片生成任务，且不产生重复正式卡片
- 桌面端默认视觉语言已在 MVP 落地，不出现手机底部导航式结构或企业后台模板风

#### 2.2.1 平台基础模块（P0）

**功能目标：**

- 建立桌面端本地优先应用骨架，确保数据库、文件、密钥、后台任务和日志能力稳定可用
- 为后续V2-V4阶段复用统一的数据层、模型层和任务层
- 建立桌面端默认设计系统，统一纸感壳层、细墨线组件、手绘边框、字体槽位和多栏页面骨架

**核心流程：**

1. 应用启动时初始化SQLite、迁移脚本、FTS5索引和Stronghold
2. 前端通过命令桥读取设置、最近文档、默认模型和待恢复任务
3. 长任务通过 Rust Host 任务层与 `Python Orchestration Service` 协同执行
4. 任务状态通过事件流回传前端并持久化到SQLite
5. 前端设计系统在应用启动时加载默认主题Token、字体资源与纸感纹理资源

**关键接口 / 数据结构：**

```typescript
ModelProfile {
  id: string
  provider: 'openai' | 'anthropic' | 'custom'
  name: string
  model: string
  baseUrl?: string
  budgetLimit?: number
  isDefault: boolean
}

WorkflowRun {
  id: string
  type: 'card_generation'
  status: 'queued' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'
  checkpointRef?: string
  startedAt?: Date
  finishedAt?: Date
}

ThemeTokens {
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

SketchStyle {
  lineWeight: 'hairline' | 'thin' | 'medium'
  roughness: number
  underlineStyle: 'pencil' | 'marker'
  scribbleOpacity: number
}

SurfaceVariant = 'canvas' | 'panel' | 'paperCard' | 'stickyNote' | 'toolbar' | 'modal'

PageShellVariant = 'dashboard' | 'library' | 'reader' | 'review' | 'settings'
```

**技术约束：**

- SQLite为唯一真源
- 明文密钥不得写入数据库或日志
- 长任务必须支持取消与恢复
- 默认设计Token在 MVP 即落地，不等待 V4 再建立
- 默认基准色值固定为 `paperBase = #fbfbf9`、`ink = #1a1a1a`、`inkMuted = #666666`、`inkSoft = #a0a0a0`、`lineSoft = #e5e5e0`
- 字体槽位固定为 `fontDisplay = Kose / Xiaolai-Regular.ttf`、`fontUi = Yozai`、`fontBody = LXGW WenKai`、`fontLatinMeta = Inter`
- 桌面壳层遵循“左侧导航轨 + 主画布 + 上下文侧栏”的多栏结构，不复刻手机单栏布局

#### 2.2.2 文档导入与锚点模块（P0）

**功能目标：**

- 支持上传PDF、解析文本、建立页码和坐标锚点，为卡片生成和贴笺阅读提供稳定来源定位

**支持格式：**

- PDF文档（MVP阶段仅支持PDF）

**上传流程：**

1. 用户点击"上传文档"按钮
2. 选择本地PDF文件
3. 系统解析PDF内容，提取文本与页面信息
4. 建立 `Document`、`DocumentChunk`、`DocumentAnchor`
5. 显示文档预览，用户确认后进入卡片生成流程

**关键接口 / 数据结构：**

```typescript
Document {
  id: string
  title: string
  filePath: string
  fileSize: number
  pageCount: number
  contentHash: string
  createdAt: Date
  status: 'uploading' | 'parsed' | 'indexing' | 'generating' | 'ready' | 'error'
}

DocumentAnchor {
  id: string
  documentId: string
  page: number
  paragraph: number
  textQuote: string
  rects: { x: number; y: number; width: number; height: number }[]
  hash: string
}
```

**技术约束：**

- 使用PDF.js完成文本提取和文本层定位
- 文档导入失败时保留错误状态，不写入半成品卡片
- 锚点至少包含 page + quote + rects 三重信息，避免后续贴笺错位

#### 2.2.3 卡片生产线模块（P0）

**功能目标：**

- 从文档内容中生成卡片候选，经用户确认后入库为正式卡片，并支持后续编辑、删除和导出

**生成流程：**

1. 将PDF文本按章节/段落分块
2. 调用LLM为每个分块生成卡片候选
3. 候选卡片写入 `CardCandidate`，保留来源锚点和置信度
4. 用户对候选执行接受、编辑、删除、批量确认
5. 确认后保存到正式 `Card`

**Prompt模板：**

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

**关键接口 / 数据结构：**

```typescript
CardCandidate {
  id: string
  documentId: string
  anchorId?: string
  front: string
  back: string
  tags: string[]
  confidence: number
  dedupeKey: string
}

Card {
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
```

**交互要点：**

- 支持从PDF选中文本快速创建卡片
- 支持批量确认、批量删除、批量修改标签
- 支持CSV、Anki格式导出

#### 2.2.4 阅读与贴笺模块（P0）

**功能目标：**

- 在阅读PDF时于侧边显示本页关联卡片，形成“贴笺式”学习体验

**核心流程：**

1. 打开文档并定位当前页
2. 根据页码和锚点读取本页卡片与高亮
3. 用户点击卡片时高亮原文并跳转
4. 用户在PDF选中内容后可直接创建卡片与高亮

**UI布局：**

```
┌──────────────┬──────────────────────────────────┬───────────────────────┐
│ 左侧导航轨    │ 顶部细线工具栏 + 中央 PDF 阅读区     │ 右侧贴笺上下文栏         │
│ 学笺 / 文档 / │ 缩放、翻页、搜索、回到上次位置        │ 当前页卡片、手绘便签卡、  │
│ 学习 / 设置   │ 纸感背景上的正文保持最高可读性        │ 高亮摘要、快速新建卡片    │
└──────────────┴──────────────────────────────────┴───────────────────────┘
```

**桌面视觉约束：**

- 阅读区采用纸感底色和极弱纹理，禁止高噪声贴图污染正文
- 工具栏、贴笺卡、选中态和分隔线统一使用手绘细墨线，不使用企业后台实心高亮块
- 贴笺卡保持纸片式表面和克制留白，但不得遮挡原文阅读或降低滚动效率

**关键接口 / 数据结构：**

```typescript
Highlight {
  id: string
  cardId: string
  documentId: string
  pageNumber: number
  rectangles: {
    x: number
    y: number
    width: number
    height: number
  }[]
  textContent: string
  color: string
  createdAt: Date
}
```

**技术约束：**

- PDF渲染使用PDF.js文本层
- 高亮图层使用自定义SVG/Canvas覆盖层
- 阅读滚动与卡片侧栏必须双向联动
- 手绘边框、下划线和纹理只作壳层与控件强调，不得干扰正文选择、高亮和跳转热区

#### 2.2.5 学习调度模块（P0）

**功能目标：**

- 基于FSRS提供今日任务、翻卡学习、列表学习、复习评分与复习记录

**采用FSRS-4.5算法：**

- 实现方式：ts-fsrs
- 参数自动优化
- 冷启动友好（使用默认参数）
- 支持四档难度评级：Again / Hard / Good / Easy

**每日学习推荐逻辑：**

1. 计算所有卡片的可提取性（Retrievability）
2. 优先推送今日到期复习卡片
3. 新卡片按用户设定的每日上限推送
4. 学习时长按用户设定限制

**学习界面：**

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

**列表学习视图：**

- 同步显示问题和答案
- 支持按状态、标签、文档、下次复习时间筛选
- 支持批量删除、批量修改标签、批量重置进度
- 使用虚拟滚动支持大规模卡片浏览
- 列表页保留纸感壳层与手绘分隔线，但不使用后台管理台式重表格视觉

**关键接口 / 数据结构：**

```typescript
ReviewLog {
  id: string
  cardId: string
  rating: 'again' | 'hard' | 'good' | 'easy'
  reviewedAt: Date
  state: 'new' | 'learning' | 'review' | 'relearning'
  difficulty: number
  stability: number
  retrievability: number
  nextReview: Date
  intervalDays: number
}
```

**视觉约束：**

- 学习界面优先保证卡片问题、答案和评分按钮的可读性，禁止使用夸张手写体作为正文
- 进度信息保持弱化展示，不用大面积仪表盘或重色块分散注意力
- 动效只用于翻卡、状态切换和页面进入，不得造成学习流程阻塞

#### 2.2.6 BYOK与最小统计模块（P0）

**功能目标：**

- 允许用户配置自有模型凭证，并查看最小可用学习反馈

**支持的API提供商：**

- OpenAI
- Anthropic
- 兼容OpenAI协议的第三方服务

**API配置：**

```typescript
APIConfig {
  id: string
  provider: 'openai' | 'anthropic' | 'custom'
  name: string
  apiKey: string
  baseUrl?: string
  model: string
  isDefault: boolean
}

DailyStats {
  date: Date
  newCards: number
  reviewCards: number
  learningTime: number
  correctRate: number
}
```

**成本控制：**

- 显示每次API调用的token消耗
- 估算费用
- 设置月度预算警告
- 支持按工作流设置单次任务预算上限

**反馈展示：**

- 今日学习张数
- 今日学习时长
- 基础热力图
- 卡片掌握度分布

**桌面视觉约束：**

- 设置页与统计页沿用同一纸感壳层、细墨线分隔和克制留白
- 统计页应呈现“克制概览”，不做企业后台式多彩驾驶舱
- 设置表单、模型选择器和连接测试区域必须优先保证文本清晰度与表单可操作性

**技术约束：**

- 使用 `Tauri Stronghold` 保存密钥
- SQLite仅保存模型元数据，不保存明文API Key
- 统计以真实学习日志为准，禁止前端单独维护影子计数

#### 2.2.7 MVP阶段技术约束与边界

- 仅支持PDF，不支持MD/TXT/DOCX导入
- 不提供知识库问答
- 不提供积分系统
- 不提供动画生成与播客生成
- 不提供知识图谱
- 不交付Android版本，仅保证后续架构可迁移

### 2.3 V2阶段详细规格

V2目标是在MVP闭环稳定后，扩展“学完之后还能问、还能积累激励、还能导入更多材料”的增强能力。V2依赖MVP已有的SQLite、锚点、卡片、ModelGateway、ToolGateway 与 `Python Orchestration Service`，不重新设计底层。

**Done Means：**

- 用户可对指定知识范围问答并看到引用
- 可导入 MD/TXT/DOCX 并继续走既有卡片流程
- 积分系统可审计、不可重复记账

**说明：**

- 本阶段重点锁定接口、数据流和验收边界
- 检索策略、导入实现和积分玩法允许在进入 V2 实施前做一次复盘收敛

#### 2.3.1 知识库问答（RAG）（P1）

**功能目标：**

- 让用户可以选定文档、卡组或知识范围，基于本地知识库进行问答，并给出引用来源

**技术选型决策：**

**向量存储：采用 sqlite-vec**
- 保持 SQLite 为唯一数据源，无需引入额外数据库进程
- 轻量级、跨平台兼容（Tauri + Android）
- 支持向量存储、余弦相似度搜索、与 FTS5 混合检索

**RAG 架构：简单 RAG（非 Agentic）**
- V2 阶段采用单轮检索，不引入复杂的多轮迭代或工具链
- 用户场景明确：基于文档的单轮问答
- 预留架构扩展点，V3/V4 可按需增强查询改写、重排序等能力

**核心流程：**

1. 用户选择知识范围（文档、标签、卡组）
2. 系统根据问题执行 FTS5 检索 + sqlite-vec 向量检索
3. RRF 融合排序后取 Top-K chunks
4. 构造带引用的上下文后生成回答
5. 回答中返回来源页码、锚点和相关卡片

**输入输出：**

- 输入：用户问题、知识范围、模型配置
- 输出：答案正文、引用列表、命中chunk、相关卡片

**关键接口 / 数据结构：**

```typescript
KnowledgeScope {
  id: string
  name: string
  documentIds: string[]
  cardGroupIds: string[]
  tags: string[]
  includeHighlights: boolean
  embeddingConfigId?: string  // V2 新增
}

EmbeddingConfig {
  id: string
  provider: 'openai' | 'anthropic' | 'custom'
  model: string              // e.g., 'text-embedding-3-small'
  dimensions: number         // e.g., 1536
  isDefault: boolean
}

RetrievalChunk {
  id: string
  documentId: string
  pageStart: number
  pageEnd: number
  content: string
  score: number
  embeddingId?: string
  rrfScore?: number          // RRF 融合分数
}

Citation {
  id: string
  documentId: string
  page: number
  anchorId?: string
  quote: string
  relevanceScore?: number
}

RagSession {
  id: string
  scopeId: string
  query: string
  answer: string
  citations: Citation[]
  retrievalMode: 'fts5' | 'hybrid'  // V2 新增：检索模式
  createdAt: Date
}
```

**数据落库 / 索引方式：**

- 保留 MVP 的 FTS5 索引
- 新增 sqlite-vec 向量虚拟表存储 embedding
- RAG 会话和引用记录入 SQLite，便于回放和调试

**新增边界与风险：**

- 混合检索的语义召回质量波动
- 不同知识范围可能导致引用串文档
- 必须支持无 embedding 时退回到纯 FTS5
- sqlite-vec 扩展加载失败时需降级处理

#### 2.3.2 积分系统（P1）

**功能目标：**

- 用轻量激励提高连续学习意愿，不改变学习主逻辑

**核心流程：**

1. 用户完成复习、新卡学习、连续签到等动作
2. 系统生成积分事件并累计到账本
3. UI展示今日获得积分、连续天数和简单成就

**关键接口 / 数据结构：**

```typescript
PointLedger {
  id: string
  userId: string
  delta: number
  reason: 'daily_review' | 'new_card' | 'streak' | 'milestone'
  sourceId?: string
  createdAt: Date
}

RewardEvent {
  id: string
  ledgerId: string
  title: string
  description: string
}
```

**数据落库 / 约束：**

- 所有积分变更入账本，不直接覆盖总分
- 同一学习事件只能记账一次
- 支持撤销异常记账和防刷分审计

#### 2.3.3 更多文档格式（P1）

**功能目标：**

- 将导入格式从PDF扩展到MD、TXT、DOCX，扩大资料来源

**核心流程：**

1. 用户上传MD/TXT/DOCX文件
2. 系统转为标准化文本结构
3. 为可定位内容建立锚点；无法精确定位时执行降级锚点策略
4. 进入与PDF相同的卡片生成和学习流程

**关键接口 / 数据结构：**

```typescript
ImportedDocument {
  id: string
  fileType: 'pdf' | 'md' | 'txt' | 'docx'
  title: string
  contentHash: string
  importStrategy: 'native' | 'converted'
  anchorMode: 'coordinate' | 'text-range' | 'paragraph'
}
```

**与前阶段衔接：**

- 复用 `Document`、`DocumentAnchor`、`CardCandidate`、`Card`
- 只扩展 `fileType` 与锚点模式
- 对无坐标文档降级为 paragraph/text-range 锚点

### 2.4 V3阶段详细规格

V3目标是在学习闭环与问答能力稳定后，加入更强的多媒体表达能力，但仍保持本地优先和可恢复任务模型。

**Done Means：**

- 动画与播客任务都能稳定生成结果
- 长任务支持恢复、取消和预算中止
- 失败任务保留可重试的最小上下文

**说明：**

- 本阶段更关注任务模型、资源管理和用户体验边界
- 动画引擎和播客风格实现不在当前文档中提前锁死为单一路径

#### 2.4.1 卡片内容动画生成（P2）

**功能目标：**

- 将卡片内容转为可预览的可视化演示，优先支持数学、图形和概念过程类内容

**核心流程：**

1. 用户在卡片详情页点击“生成演示动画”
2. 系统分析卡片内容并选择适合的动画模板或代码生成策略
3. 生成脚本、渲染产物、预览资源并写入任务记录
4. 用户可重新生成、删除或保存动画资源

**关键接口 / 数据结构：**

```typescript
AnimationJob {
  id: string
  cardId: string
  engine: 'p5js' | 'manim'
  status: 'queued' | 'running' | 'completed' | 'failed'
  script: string
  createdAt: Date
}

AnimationAsset {
  id: string
  jobId: string
  kind: 'html' | 'js' | 'mp4' | 'gif' | 'thumbnail'
  filePath: string
}
```

**数据落库 / 风险：**

- 动画任务与资源文件均落库
- 失败任务保留日志和脚本，便于重试
- 需控制生成代码的执行边界与资源清理

#### 2.4.2 AI播客生成（P2）

**功能目标：**

- 根据文档或卡片集合自动生成播客式学习材料，包括脚本和音频

**核心流程：**

1. 用户选择知识范围和播客风格
2. 系统生成提纲、对话脚本和角色分段
3. TTS生成音频片段并拼接为完整节目
4. 节目和脚本写入本地文件与数据库

**关键接口 / 数据结构：**

```typescript
PodcastScript {
  id: string
  scopeId: string
  title: string
  outline: string[]
  dialogue: { speaker: string; text: string }[]
}

AudioSegment {
  id: string
  scriptId: string
  speaker: string
  filePath: string
  durationMs: number
}

PodcastEpisode {
  id: string
  scriptId: string
  title: string
  audioPath: string
  durationMs: number
}
```

**与前阶段衔接：**

- 复用 `KnowledgeScope`、`RagSession`、`WorkflowRun`
- 由长任务层负责脚本生成、音频生成与恢复
- 必须支持预算中止与失败回退

### 2.5 V4阶段详细规格

V4目标是把“学习材料集合”升级为“结构化知识网络”，并评估跨端能力，但不承诺在此阶段立刻完成正式Android产品。

**Done Means：**

- 图谱可构建、可增量更新、可回溯来源
- 主题切换与扩展主题包不降低可访问性和阅读效率
- Android 迁移方案形成明确能力矩阵和阻塞项清单

**说明：**

- V4 主要锁定目标、接口和验收，不提前承诺具体图库、主题实现细节或移动端发布日期

#### 2.5.1 知识图谱（P3）

**功能目标：**

- 从文档、卡片、问答与学习记录中提取知识节点和关系，为用户提供结构化知识视图，并为模型生成提供更强上下文

**核心流程：**

1. 用户选择文档集或知识范围
2. 系统抽取实体、概念、关系和上下位结构
3. 对重复节点进行消歧与合并
4. 构建图谱并展示可浏览的关系网络

**关键接口 / 数据结构：**

```typescript
KnowledgeNode {
  id: string
  type: 'concept' | 'person' | 'event' | 'formula' | 'term'
  label: string
  aliases: string[]
  sourceIds: string[]
}

KnowledgeEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relation: string
  confidence: number
}

GraphBuildRun {
  id: string
  scopeId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  createdAt: Date
}
```

**数据落库 / 风险：**

- 图谱节点和关系入SQLite，必要时拆分独立图谱表
- 构建过程需要增量更新和重复实体消歧
- 图谱质量直接影响用户可信度，不得在无引用情况下展示强结论

#### 2.5.2 主题切换与扩展主题包（P3）

**功能目标：**

- 在不改变 MVP 默认视觉基线的前提下，提供主题切换、扩展主题包和无障碍回退能力

**核心流程：**

1. 读取 M1 已建立的默认设计 Token 与页面壳层能力
2. 通过 ThemeProvider 切换默认主题、扩展主题包或无障碍回退主题
3. 验证卡片、侧栏、统计页和文档阅读器在切换后仍保持一致布局与可读性

**技术约束：**

- 主题系统不得改变业务组件接口
- 扩展主题只能覆盖 Token 与资源层，不得重写核心交互结构
- 深浅色、对比度和阅读场景必须可用
- 保留默认主题回退能力

#### 2.5.3 Android能力适配评估 / 跨端规划（P4）

**功能目标：**

- 评估并规划从桌面端过渡到Android时的能力边界、文件系统适配和交互调整

**核心流程：**

1. 盘点桌面专属能力与移动端受限能力
2. 验证文件访问、数据库、后台任务、TTS与PDF体验的可迁移性
3. 输出Android实现方案与风险清单

**关键接口 / 数据结构：**

```typescript
PlatformCapabilityProfile {
  platform: 'windows' | 'macos' | 'linux' | 'android'
  supportsFileImport: boolean
  supportsBackgroundTasks: boolean
  supportsTTS: boolean
  supportsLargePdfPreview: boolean
}
```

**边界说明：**

- 此阶段输出的是能力评估和迁移方案，不承诺正式移动端上线
- 若后续启动Android实现，应在此基础上单独设立交付版本

---

## Commands

本章节定义 AI agent 在本仓库内默认应执行的命令。若命令尚未在代码库中落地，对应任务应优先补齐脚本或工具链，再继续依赖该命令。

### 当前可用命令

在 `xuejian/` 目录下执行：

```bash
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

### 目标标准命令

当 Tauri 与测试链路落地后，应统一为以下命令集合：

```bash
# 安装
cd xuejian
npm install

# 前端开发
npm run dev

# Tauri 桌面开发
npm run tauri:dev

# 前端构建
npm run build

# Tauri 桌面构建
npm run tauri:build

# 单元 / 集成测试
npm run test

# E2E
npm run test:e2e

# Lint / 格式检查
npm run lint
npm run format:check

# Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml
```

### 命令执行顺序

- 本地开发前：`npm install`
- 提交前最少执行：`npm run build`、`npm run lint`、相关阶段测试
- 修改 Rust 核心层时额外执行：`cargo test --manifest-path src-tauri/Cargo.toml`
- 修改学习闭环或工作流逻辑时额外执行：`npm run test`、相关 `E2E`

### 命令失败时的默认处理

- 先修复命令本身或补齐缺失脚本，再继续实现任务
- 不允许通过删除测试、跳过构建、注释检查来绕过失败

## Code Style & Patterns

### TypeScript / React

- 使用 TypeScript 严格类型，不允许以 `any` 作为默认逃生口
- 组件保持薄层；业务逻辑优先放入 `features/`、`services/`、`queries/`
- `TanStack Query` 负责异步数据与缓存，`Zustand` 只管理局部 UI 状态
- 不把 SQLite 中的主业务状态复制为前端长期真源
- 优先函数组件、显式 props、可组合 hooks

**推荐模式：**

```typescript
type CardListProps = {
  documentId: string
}

export function CardList({ documentId }: CardListProps) {
  const { data, isLoading } = useCardsQuery(documentId)

  if (isLoading) return <LoadingState />
  return <CardsView cards={data ?? []} />
}
```

### Rust

- `commands/` 保持薄层，只做输入输出校验和桥接
- 数据库访问、模型网关、任务流转分别放在 `db/`、`gateway/`、`tasks/`
- 序列化结构显式定义，不在命令层拼 JSON 字符串
- 敏感信息不得进入日志

**推荐模式：**

```rust
#[tauri::command]
pub async fn list_documents(state: tauri::State<'_, AppState>) -> Result<Vec<DocumentDto>, String> {
    state.db.documents().list().await.map_err(|e| e.to_string())
}
```

### 数据与安全模式

- SQLite 是唯一真源
- Stronghold 保存密钥，数据库只保存元数据
- 长任务写入 checkpoint，允许恢复，不允许重复写入正式结果

## Git Workflow

### 分支命名

- 功能：`feat/<short-name>`
- 修复：`fix/<short-name>`
- 文档：`docs/<short-name>`
- 杂项：`chore/<short-name>`

### Commit 规范

- 推荐使用 Conventional Commits：
  - `feat: ...`
  - `fix: ...`
  - `docs: ...`
  - `refactor: ...`
  - `test: ...`
  - `chore: ...`

### PR / 合并前检查

- 说明改动影响的阶段：MVP / V2 / V3 / V4
- 列出执行过的命令
- 说明是否涉及 schema、导出格式、密钥、工作流恢复
- 至少通过构建、lint 与相关阶段测试

### 文档同步要求

- 改动公开接口、数据模型、阶段边界、命令或验收标准时，必须同步更新 spec
- 若实现与 spec 冲突，优先修正文档或回退实现，不允许长期漂移

## Agent Boundaries

### Always Do

- 优先读取 `Spec Summary`、当前阶段章节与对应验收章节
- 在实现前确认应执行的命令、测试与边界
- 修改公开接口或 schema 时同步更新 spec
- 对长任务、密钥、数据库改动保持可恢复和可追溯

### Ask First

- 新增核心依赖或改变技术栈
- 修改数据库 schema 或迁移策略
- 改变导出格式、知识范围语义、阶段边界或安全模型
- 从“预留能力”提升为“当前阶段必须实现”

### Never Do

- 将明文密钥写入数据库、日志或测试快照
- 把 IndexedDB 当作主数据库
- 通过删除失败测试、绕过 lint、跳过构建来伪造完成
- 未经确认擅自扩大 MVP 范围或压缩阶段边界

## 三、技术架构规范

### 3.1 技术选型决策

#### 3.1.1 前端框架

**决策：React 19 + TypeScript + Vite**

**理由：**

- React生态成熟，组件库丰富
- TypeScript提供类型安全
- Vite构建速度快，开发体验好
- React 19更适合后续流式交互、长列表和复杂异步界面

#### 3.1.2 前端状态与数据管理

**决策：TanStack Query + Zustand**

**职责划分：**

- `TanStack Query`：负责服务端风格数据获取、缓存、失效与后台刷新
- `Zustand`：负责局部UI状态、临时交互状态、阅读视图与学习流程状态
- 避免将持久化业务数据塞入前端全局状态，SQLite始终是唯一真源

#### 3.1.3 UI框架

**决策：Tailwind CSS + Radix Primitives + 自定义设计Token**

**理由：**

- Tailwind提供原子化CSS，开发效率高
- Radix Primitives提供稳定的无样式可访问性基础组件
- 自定义设计Token更适合构建“贴笺学习”产品的独特视觉，而不是通用AI聊天面板
- 可借鉴 `shadcn/ui` 的代码组织方式，但不绑定其默认视觉系统

**默认设计系统决策：**

- MVP 默认视觉语言即为“极简学术感 + 中度手绘漫画风格”，不等待 V4 才定义
- 默认字体槽位固定为 `fontDisplay = Kose / Xiaolai-Regular.ttf`、`fontUi = Yozai`、`fontBody = LXGW WenKai`、`fontLatinMeta = Inter`
- 默认基准色值固定为 `paperBase = #fbfbf9`、`ink = #1a1a1a`、`inkMuted = #666666`、`inkSoft = #a0a0a0`、`lineSoft = #e5e5e0`
- 页面采用桌面多栏壳层和纸感底色，使用手绘细墨线边框、分隔线和按钮强调，而不是企业后台或移动端复刻布局

#### 3.1.4 桌面端框架

**决策：Tauri 2.0 + 小型Rust核心层（桌面优先）**

**理由：**

- 基于Rust，安全性高、体积小（~3MB）
- 原生支持Windows/macOS/Linux
- 性能优于Electron
- MVP阶段专注桌面端，但从第一天固定 Host / Protocol 分层，为后续 Android 协议复用预留路径
- Rust核心层可稳定承接SQLite、文件系统、密钥存储、后台任务和模型网关

#### 3.1.5 数据存储

**决策：原生SQLite为主，IndexedDB仅作缓存层**

**理由：**

- SQLite适合作为本地优先应用的唯一真源，便于事务、索引、迁移和离线持久化
- Rust侧直接访问SQLite，避免 `sql.js` 在大文档、并发写入、长期演进中的限制
- IndexedDB仅用于前端缓存性场景，如PDF页面缓存、缩略图缓存、临时渲染数据
- MVP即可使用 `SQLite FTS5 + 元数据过滤` 支撑全文检索和后续RAG基础设施

**数据持久化策略：**

- SQLite数据库文件存放于应用数据目录，由Rust核心统一读写
- 大文件（PDF、导出数据、播客音频）通过Tauri文件API保存到文件系统
- IndexedDB仅保存可丢弃缓存，不作为主数据库
- Agent checkpoint、FSRS状态、卡片、高亮、统计均入SQLite

**检索策略：**

- MVP：`SQLite FTS5 + 标签/文档/页码等元数据过滤`
- V2：在保留FTS5的前提下新增embedding表与混合检索
- MVP不依赖 `sqlite-vec` 或外部向量数据库

#### 3.1.6 AI集成

**决策：Host Gateway + Python Orchestration Service + UI 三层架构**

```
HostGateway {
  model: ModelGateway
  tool: ToolGateway
  workflow: WorkflowRegistry
}

PythonOrchestrationService {
  protocol: OrchestrationProtocol
  presets: PresetWorkflowRegistry
  runtime: LangChainRuntime
}

ReactUI {
  progress: WorkflowEventStream
  approval: HumanReviewViews
  settings: ModelAndBudgetSettings
}
```

**设计说明：**

- `ModelGateway` 负责多模型协议适配、成本统计、流式输出与错误归一化
- `ToolGateway` 负责文档解析、检索、导出、音频生成和数据库写入等受控工具调用
- `Python Orchestration Service` 负责预设工作流编排、Prompt 组装和状态推进
- 详细运行边界以 [ai-architecture-decision.md](./ai-architecture-decision.md) 为准

### 3.2 AI编排架构

**首版平台形态：内置预设工作流 + 轻量配置**

- 不做可视化工作流编排器，不开放用户自定义图结构
- 对用户暴露“选择预设工作流并微调参数”的体验，而不是“自己搭Agent平台”
- 每个 `PresetWorkflow` 只开放必要参数：模型、知识源、提示词模板、工具开关、预算上限

**首版内置3类预设工作流：**

1. **文档转卡片工作流**
   - 流程：文档解析 → 分块 → 卡片候选生成 → 去重/合并 → 用户确认 → 入库
2. **知识问答链路**
   - 流程：限定知识源 → FTS5 / 向量检索 → 构造引用上下文 → 回答生成 → 返回来源锚点
   - 说明：保持“简单 RAG（非 Agentic）”，不并入 agent runtime
3. **播客生成工作流**
   - 流程：提纲生成 → 对话脚本生成 → 语音任务编排 → 音频文件落盘

**运行时设计：**

- 桌面端通过本地 `Python Orchestration Service` 执行 LangChain 工作流
- `WorkflowRun`、`WorkflowCheckpoint` 与 `WorkflowEvent` 通过 Host 持久化和分发
- 前端只消费事件流、审批点和结果，不直接承接编排逻辑
- `LangGraph` 仅保留为未来升级路径，不作为现行运行时前提

### 3.3 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        React UI 层                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ 文档管理 │ │ 贴笺学习 │ │ 卡片学习 │ │ 统计分析 │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
├─────────────────────────────────────────────────────────────┤
│               前端应用层（Query / Store / ViewModel）        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ TanStack    │ │ Zustand UI  │ │ PDF/Markdown│          │
│  │ Query       │ │ State       │ │ Renderers   │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│                Python Orchestration Service                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ 文档转卡片   │ │ 播客生成     │ │ 未来复杂工作流 │          │
│  │ Preset      │ │ Preset      │ │ Upgrade Path│          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│                    Rust Host 核心服务层                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ Command     │ │ SQLite Repo │ │ Stronghold  │          │
│  │ Bridge      │ │ + FTS5      │ │ Secrets     │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ File IO     │ │ ModelGateway│ │ Workflow /  │          │
│  │             │ │ ToolGateway │ │ Event Bus   │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│                      存储层                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ SQLite      │ │ 文件系统     │ │ IndexedDB   │          │
│  │ (主数据库)   │ │ (PDF/导出/音频)│ │ (可丢弃缓存)│          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

**架构说明：**

- React UI层负责阅读、学习、设置、统计等最终交互
- 前端应用层负责缓存、状态管理和视图模型，不直接持有主业务真相
- Python 服务负责预设工作流的编排推进，但不持有密钥和主数据库真相
- Rust Host 负责 SQLite、文件、密钥、任务状态、预算和事件分发
- 存储层中仅 SQLite 是主数据库，IndexedDB 不承担持久化真源职责

### 3.4 前端、Host 与 Python 职责边界

**前端负责：**

- 页面交互、阅读体验、卡片编辑、学习流程、统计展示
- PDF渲染、Markdown/LaTeX渲染、流式输出展示
- Query缓存和局部状态管理

**Rust Host 负责：**

- SQLite数据库连接、迁移、索引、事务与 FTS5 检索
- 文件落盘、目录管理、导出、音频文件管理
- Stronghold 密钥保存与读取
- `ModelGateway`、`ToolGateway`、预算执行、任务取消、事件流分发
- `WorkflowRun` / `WorkflowCheckpoint` / `WorkflowEvent` 持久化和恢复

**Python Orchestration Service 负责：**

- `PresetWorkflow` 编排、Prompt 组装、阶段推进
- 通过 `Orchestration Protocol` 调用 Host 的模型与工具能力
- 不直接持有明文密钥，不直接定义 SQLite 真源

**边界原则：**

- 前端不直接写主数据库文件
- 前端不直接持久化明文敏感数据
- Python 服务不直接绕过 Host 写主数据库或读取密钥
- 长耗时任务通过 Host + Python 服务协同执行

### 3.5 目录结构

```
xuejian/
├── src/                           # 前端源代码
│   ├── app/                       # App入口、路由、QueryClient
│   ├── components/
│   │   ├── ui/                    # Radix primitives + 自定义样式封装
│   │   ├── cards/
│   │   ├── documents/
│   │   ├── learning/
│   │   └── stats/
│   ├── features/
│   │   ├── cards/
│   │   ├── documents/
│   │   ├── agents/
│   │   ├── settings/
│   │   └── review/
│   ├── services/
│   │   ├── gateway/               # 前端调用Tauri命令的桥接层
│   │   ├── renderer/              # PDF/Markdown/LaTeX渲染配置
│   │   └── learning/              # ts-fsrs封装
│   ├── store/                     # Zustand UI状态
│   ├── queries/                   # TanStack Query hooks
│   ├── types/
│   └── App.tsx
├── src-tauri/                     # Rust核心层
│   ├── src/
│   │   ├── commands/
│   │   │   ├── documents.rs
│   │   │   ├── models.rs
│   │   │   ├── agents.rs
│   │   │   └── settings.rs
│   │   ├── db/                    # SQLite连接、迁移、仓库
│   │   ├── gateway/               # ModelGateway / ToolGateway
│   │   ├── tasks/                 # 后台任务、事件流、取消与恢复
│   │   ├── secrets/               # Stronghold封装
│   │   └── lib.rs
│   └── Cargo.toml
├── python/
│   └── orchestration/             # Python服务、协议与预设工作流
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

---

## 四、数据模型规范

### 4.1 核心实体关系图

```
┌──────────┐   1:N   ┌──────────────┐   1:N   ┌──────────┐
│ Document │────────▶│DocumentAnchor│────────▶│   Card   │
└──────────┘         └──────────────┘         └──────────┘
      │                       │                     │
      │ 1:N                   │ 1:N                 │ 1:N
      ▼                       ▼                     ▼
┌──────────┐            ┌──────────┐          ┌──────────┐
│ Chunk    │            │Highlight │          │ReviewLog │
└──────────┘            └──────────┘          └──────────┘
      │                                             │
      │ N:M via scope                               │
      ▼                                             ▼
┌──────────────┐     1:N     ┌──────────────┐  1:N ┌────────────┐
│KnowledgeScope│────────────▶│ AgentPreset  │─────▶│ AgentRun   │
└──────────────┘             └──────────────┘      └────────────┘
```

**建模原则：**

- SQLite是唯一真源，卡片、高亮、FSRS、Agent checkpoint、统计全部入库
- 文档锚点单独建模，避免“卡片字段既承载业务又承载定位”的长期耦合
- Agent相关数据与学习数据共用同一数据库，便于事务和恢复

### 4.2 核心数据结构

```typescript
Document {
  id: string
  title: string
  filePath: string
  fileType: 'pdf'
  fileSize: number
  pageCount: number
  contentHash: string
  status: 'uploading' | 'parsed' | 'indexing' | 'generating' | 'ready' | 'error'
  createdAt: Date
  updatedAt: Date
}

DocumentAnchor {
  id: string
  documentId: string
  page: number
  paragraph: number
  textQuote: string
  rects: { x: number; y: number; width: number; height: number }[]
  hash: string
}

KnowledgeScope {
  id: string
  name: string
  documentIds: string[]
  cardGroupIds: string[]
  tags: string[]
  pageRanges?: { start: number; end: number }[]
  includeHighlights: boolean
}

CardCandidate {
  id: string
  front: string
  back: string
  anchorId: string
  tags: string[]
  confidence: number
  dedupeKey: string
}

AgentPreset {
  id: string
  type: 'card_generation' | 'knowledge_qa' | 'podcast_generation'
  name: string
  modelProfileId: string
  knowledgeScopeId?: string
  promptTemplate: string
  enabledTools: string[]
  budgetLimit?: number
  createdAt: Date
}

AgentRun {
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

### 4.3 分阶段扩展类型

**MVP公共模型：**

- `Document`
- `DocumentAnchor`
- `CardCandidate`
- `Card`
- `Highlight`
- `ReviewLog`
- `DailyStats`
- `ModelProfile`
- `WorkflowRun` / 内部 `AgentRun`

**V2新增类型：**

```typescript
// Embedding 配置
EmbeddingConfig {
  id: string
  provider: 'openai' | 'anthropic' | 'custom'
  model: string              // e.g., 'text-embedding-3-small'
  dimensions: number         // e.g., 1536
  isDefault: boolean
}

// Embedding 结果
EmbeddingResult {
  chunkId: string
  embedding: number[]
  model: string
}

RetrievalChunk {
  id: string
  documentId: string
  pageStart: number
  pageEnd: number
  content: string
  score: number
  embeddingId?: string
  rrfScore?: number          // RRF 融合分数
}

Citation {
  id: string
  documentId: string
  page: number
  anchorId?: string
  quote: string
  relevanceScore?: number
}

RagSession {
  id: string
  scopeId: string
  query: string
  answer: string
  citations: Citation[]
  retrievalMode: 'fts5' | 'hybrid'
  createdAt: Date
}

PointLedger {
  id: string
  userId: string
  delta: number
  reason: 'daily_review' | 'new_card' | 'streak' | 'milestone'
  sourceId?: string
  createdAt: Date
}

ImportedDocument {
  id: string
  fileType: 'pdf' | 'md' | 'txt' | 'docx'
  importStrategy: 'native' | 'converted'
  anchorMode: 'coordinate' | 'text-range' | 'paragraph'
}
```

**V3新增类型：**

```typescript
AnimationJob {
  id: string
  cardId: string
  engine: 'p5js' | 'manim'
  status: 'queued' | 'running' | 'completed' | 'failed'
}

AnimationAsset {
  id: string
  jobId: string
  kind: 'html' | 'js' | 'mp4' | 'gif' | 'thumbnail'
  filePath: string
}

PodcastScript {
  id: string
  scopeId: string
  title: string
  outline: string[]
  dialogue: { speaker: string; text: string }[]
}

PodcastEpisode {
  id: string
  scriptId: string
  title: string
  audioPath: string
  durationMs: number
}

AudioSegment {
  id: string
  scriptId: string
  speaker: string
  filePath: string
  durationMs: number
}
```

**V4新增类型：**

```typescript
KnowledgeNode {
  id: string
  type: 'concept' | 'person' | 'event' | 'formula' | 'term'
  label: string
}

KnowledgeEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relation: string
  confidence: number
}

GraphBuildRun {
  id: string
  scopeId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
}

PlatformCapabilityProfile {
  platform: 'windows' | 'macos' | 'linux' | 'android'
  supportsFileImport: boolean
  supportsBackgroundTasks: boolean
  supportsTTS: boolean
  supportsLargePdfPreview: boolean
}
```

**衔接原则：**

- 阶段新增类型优先扩展现有模型，不重写MVP核心表
- 能作为公共业务模型的类型入SQLite；仅任务内部使用的结构可保留为运行时对象
- 涉及索引或迁移的新增类型必须提供增量迁移脚本

### 4.4 数据库Schema

```sql
-- 用户配置表
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settings JSON
);

-- API配置表
CREATE TABLE api_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    base_url TEXT,
    model TEXT,
    budget_limit REAL,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 文档表
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT DEFAULT 'pdf',
    file_size INTEGER,
    page_count INTEGER,
    content_hash TEXT,
    status TEXT DEFAULT 'uploading',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 文档分块表（MVP用于FTS5与后续RAG基础）
CREATE TABLE document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    page_start INTEGER,
    page_end INTEGER,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE document_chunks_fts USING fts5(
    content,
    content='document_chunks',
    content_rowid='rowid'
);

-- 卡片组表
CREATE TABLE card_groups (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 文档锚点表
CREATE TABLE document_anchors (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    page INTEGER NOT NULL,
    paragraph INTEGER,
    text_quote TEXT NOT NULL,
    rects JSON,
    hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 卡片表
CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    group_id TEXT REFERENCES card_groups(id),
    document_id TEXT REFERENCES documents(id),
    anchor_id TEXT REFERENCES document_anchors(id),
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    source_page INTEGER,
    source_paragraph INTEGER,
    source_coordinates JSON,
    tags JSON,
    difficulty REAL DEFAULT 0.3,
    stability REAL DEFAULT 1.0,
    retrievability REAL,
    state TEXT DEFAULT 'new',
    next_review DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 高亮表
CREATE TABLE highlights (
    id TEXT PRIMARY KEY,
    card_id TEXT REFERENCES cards(id),
    document_id TEXT REFERENCES documents(id),
    anchor_id TEXT REFERENCES document_anchors(id),
    page_number INTEGER NOT NULL,
    rectangles JSON NOT NULL,
    text_content TEXT NOT NULL,
    color TEXT DEFAULT '#F8E16C',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 卡片候选表（用户确认前）
CREATE TABLE card_candidates (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    anchor_id TEXT REFERENCES document_anchors(id),
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    tags JSON,
    confidence REAL,
    dedupe_key TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 复习记录表
CREATE TABLE review_logs (
    id TEXT PRIMARY KEY,
    card_id TEXT REFERENCES cards(id),
    rating TEXT NOT NULL,
    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    state TEXT,
    difficulty REAL,
    stability REAL,
    retrievability REAL,
    next_review DATE,
    interval_days INTEGER
);

-- 每日统计表
CREATE TABLE daily_stats (
    id TEXT PRIMARY KEY,
    date DATE UNIQUE,
    new_cards INTEGER DEFAULT 0,
    review_cards INTEGER DEFAULT 0,
    learning_time INTEGER DEFAULT 0,
    correct_rate REAL
);

-- 知识范围表
CREATE TABLE knowledge_scopes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    document_ids JSON,
    card_group_ids JSON,
    tags JSON,
    page_ranges JSON,
    include_highlights BOOLEAN DEFAULT TRUE,
    embedding_config_id TEXT,  -- V2: 关联 embedding 配置
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- V2: Embedding 配置表
CREATE TABLE embedding_configs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,           -- 'openai' | 'anthropic' | 'custom'
    model TEXT NOT NULL,              -- 'text-embedding-3-small' 等
    dimensions INTEGER NOT NULL,      -- 向量维度，如 1536
    is_default BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- V2: Document Embedding 表
CREATE TABLE document_embeddings (
    id TEXT PRIMARY KEY,
    chunk_id TEXT NOT NULL REFERENCES document_chunks(id),
    embedding BLOB,                   -- 序列化向量数据
    embedding_model TEXT,             -- 使用的 embedding 模型
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- V2: RAG 会话表
CREATE TABLE rag_sessions (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL REFERENCES knowledge_scopes(id),
    query TEXT NOT NULL,
    answer TEXT NOT NULL,
    retrieval_mode TEXT NOT NULL,     -- 'fts5' | 'hybrid'
    model_used TEXT,
    tokens_used INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- V2: 引用表
CREATE TABLE citations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES rag_sessions(id),
    document_id TEXT NOT NULL REFERENCES documents(id),
    page INTEGER,
    anchor_id TEXT REFERENCES document_anchors(id),
    quote TEXT NOT NULL,
    relevance_score REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- V2: sqlite-vec 向量虚拟表（通过 Rust 扩展加载）
-- 示例：使用 OpenAI text-embedding-3-small (1536维)
-- CREATE VIRTUAL TABLE vec_chunks USING vec0(
--     chunk_id TEXT PRIMARY KEY,
--     embedding FLOAT[1536]
-- );

-- Agent预设表
CREATE TABLE agent_presets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    model_profile_id TEXT REFERENCES api_configs(id),
    knowledge_scope_id TEXT REFERENCES knowledge_scopes(id),
    prompt_template TEXT NOT NULL,
    enabled_tools JSON,
    budget_limit REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent运行表
CREATE TABLE agent_runs (
    id TEXT PRIMARY KEY,
    preset_id TEXT NOT NULL REFERENCES agent_presets(id),
    status TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    checkpoint_ref TEXT,
    approval_payload JSON,
    cost_usd REAL,
    error_message TEXT,
    started_at DATETIME,
    finished_at DATETIME
);
```

---

## 五、分阶段验收与测试计划

### 5.1 MVP验收（TDD）

MVP的成功以“学习闭环是否完整可用”为准，测试维度覆盖平台基础、文档导入、卡片生成、阅读贴笺、FSRS调度、BYOK配置、视觉一致性与端到端流程。MVP阶段保持最细粒度测试结构。

#### 5.1.1 文档导入与锚点测试

**单元测试：**

| 测试ID    | 测试用例        | 预期结果                          |
| --------- | --------------- | --------------------------------- |
| U-DOC-001 | 上传有效PDF文件 | 返回Document对象，status='parsed' |
| U-DOC-002 | 上传非PDF文件   | 抛出InvalidFileTypeError          |
| U-DOC-003 | 上传空文件      | 抛出EmptyFileError                |
| U-DOC-004 | 上传损坏的PDF   | 抛出CorruptedFileError            |
| U-DOC-005 | 解析PDF提取文本 | 返回正确的文本内容和页数          |
| U-DOC-006 | 生成文本锚点    | 返回包含page、quote、rects的锚点  |

**集成测试：**

| 测试ID    | 测试用例         | 预期结果                           |
| --------- | ---------------- | ---------------------------------- |
| I-DOC-001 | 完整上传流程     | 文件保存到本地，数据库记录创建成功 |
| I-DOC-002 | 上传后可查询文档 | 通过ID查询返回完整文档信息         |
| I-DOC-003 | 锚点持久化       | 重启后仍可定位到正确页面与文本     |

#### 5.1.2 卡片生产线测试

**单元测试：**

| 测试ID    | 测试用例             | 预期结果                                  |
| --------- | -------------------- | ----------------------------------------- |
| U-GEN-001 | 调用LLM生成卡片候选  | 返回符合Schema的 `CardCandidate` 数组     |
| U-GEN-002 | 空内容生成           | 返回空数组，不抛异常                      |
| U-GEN-003 | 卡片结构验证         | 每张候选卡包含front、back、anchorId       |
| U-GEN-004 | 分块逻辑测试         | 长文档正确分块，无内容丢失                |
| U-GEN-005 | 候选确认入库         | `CardCandidate` 成功转换为正式 `Card`     |
| U-GEN-006 | 候选去重             | 相同dedupeKey的重复候选不会重复入库       |

**集成测试：**

| 测试ID    | 测试用例             | 预期结果                         |
| --------- | -------------------- | -------------------------------- |
| I-GEN-001 | 从文档生成卡片并保存 | 卡片保存到数据库，关联正确文档   |
| I-GEN-002 | 生成后可查询卡片     | 通过documentId查询返回所有卡片   |
| I-GEN-003 | API Key无效时        | 返回明确错误信息，不保存无效数据 |
| I-GEN-004 | 任务恢复后继续生成   | 恢复运行不会产生重复正式卡片     |

#### 5.1.3 卡片管理与渲染测试

**单元测试：**

| 测试ID    | 测试用例            | 预期结果                         |
| --------- | ------------------- | -------------------------------- |
| U-CRD-001 | 创建卡片            | 卡片保存成功，返回带ID的Card对象 |
| U-CRD-002 | 更新卡片            | 修改内容成功，updatedAt更新      |
| U-CRD-003 | 删除卡片            | 卡片从数据库移除                 |
| U-CRD-004 | 批量删除            | 多张卡片同时删除成功             |
| U-CRD-005 | 搜索卡片            | 按关键词返回匹配结果             |
| U-CRD-006 | 导出为CSV           | 生成有效的CSV格式文件            |
| U-CRD-007 | 导出为Anki格式      | 生成有效的.apkg文件              |
| U-MD-001  | 渲染Markdown标题    | 正确显示h1-h6，样式正确          |
| U-MD-002  | 渲染LaTeX公式       | KaTeX正确渲染行内和块级公式      |
| U-MD-003  | 渲染代码块          | 语法高亮正确显示                 |
| U-MD-004  | 渲染图片            | 图片正确显示，支持相对路径       |
| U-MD-005  | 渲染表格            | GFM表格正确渲染                  |

#### 5.1.4 阅读与贴笺测试

**视觉与可用性检查：**

- 桌面阅读页采用左侧导航轨、中央 PDF 阅读区、右侧贴笺栏，不出现手机底部导航式结构
- 贴笺卡、高亮态、工具栏与分隔线符合统一的纸感壳层和手绘细墨线语言
- 纸张纹理与装饰线不影响正文选择、滚动、高亮或点击热区

**单元测试：**

| 测试ID    | 测试用例          | 预期结果                          |
| --------- | ----------------- | --------------------------------- |
| U-STK-001 | 按页码获取卡片    | 返回指定页的所有卡片              |
| U-STK-002 | 坐标计算          | 缩放后卡片位置正确映射            |
| U-STK-003 | 卡片排序          | 按sourceParagraph正确排序         |
| U-HL-001  | 创建高亮区域      | 高亮正确显示在PDF上               |
| U-HL-002  | 高亮与卡片关联    | 点击高亮打开对应卡片              |
| U-HL-003  | 缩放后高亮位置    | 坐标正确映射，位置不变            |
| U-HL-004  | 编辑高亮范围      | 拖拽后范围正确更新                |
| U-HL-005  | 删除高亮          | 高亮从PDF和数据库中移除           |

**集成测试：**

| 测试ID    | 测试用例              | 预期结果                           |
| --------- | --------------------- | ---------------------------------- |
| I-STK-001 | PDF渲染与卡片联动     | 滚动PDF时卡片列表正确更新          |
| I-STK-002 | 点击卡片跳转          | 点击卡片后PDF滚动到对应位置        |
| I-STK-003 | 从PDF创建卡片         | 选中文本创建卡片成功               |
| I-HL-001  | 从PDF选中文本创建高亮 | 高亮创建成功，卡片关联正确         |
| I-HL-002  | 高亮数据持久化        | 重载PDF后高亮仍正确显示            |

#### 5.1.5 学习调度与统计测试

**视觉与可用性检查：**

- 学习页保持中央卡片舞台与低干扰状态信息，不退化为后台列表面板
- 卡片正文、答案和评分按钮在默认字体与默认缩放下保持高可读性
- 最小统计页为克制概览，不出现多彩驾驶舱式重装饰布局

**单元测试：**

| 测试ID    | 测试用例           | 预期结果                         |
| --------- | ------------------ | -------------------------------- |
| U-FRS-001 | 新卡片首次复习     | state='learning'，计算nextReview |
| U-FRS-002 | Again评级          | stability降低，interval缩短      |
| U-FRS-003 | Easy评级           | stability增加，interval延长      |
| U-FRS-004 | retrievability计算 | 返回0-1之间的概率值              |
| U-FRS-005 | 今日到期卡片       | 返回nextReview <= today的卡片    |
| U-STS-001 | 日统计计算         | 正确计算当日学习数据             |
| U-STS-002 | 热力图数据生成     | 返回90天的学习记录数组           |
| U-STS-003 | 正确率计算         | 复习正确率计算准确               |

**集成测试：**

| 测试ID    | 测试用例           | 预期结果                     |
| --------- | ------------------ | ---------------------------- |
| I-FRS-001 | 完整复习流程       | 评级后更新卡片状态和复习记录 |
| I-FRS-002 | 复习记录保存       | ReviewLog正确保存到数据库    |
| I-STS-001 | 学习后统计自动更新 | 热力图和今日数据同步更新     |

#### 5.1.6 BYOK与端到端测试

**视觉与可用性检查：**

- 首页、阅读页、学习页、设置页都符合统一视觉语言
- 设置表单和连接测试区域在默认主题下保持清晰、可操作

**单元测试：**

| 测试ID    | 测试用例                 | 预期结果                                  |
| --------- | ------------------------ | ----------------------------------------- |
| U-API-001 | 保存API配置              | 元数据入库，API Key写入Stronghold         |
| U-API-002 | 读取API配置              | 返回正确元数据，按需从Stronghold取回密钥  |
| U-API-003 | 删除API配置              | 数据库记录移除，Stronghold密钥同步删除    |
| U-API-004 | OpenAI连接测试           | 返回连接成功/失败状态                     |
| U-API-005 | Anthropic连接测试        | 返回连接成功/失败状态                     |
| U-API-006 | 日志脱敏                 | 日志中不出现明文API Key                   |
| U-RUN-001 | 工作流取消               | 任务取消后状态持久化正确                  |
| U-RUN-002 | 工作流恢复               | checkpoint恢复后继续执行                  |

**E2E测试：**

| 测试ID  | 测试场景         | 测试步骤                                                  | 预期结果                       |
| ------- | ---------------- | --------------------------------------------------------- | ------------------------------ |
| E2E-001 | 首次使用完整流程 | 1. 打开应用 2. 配置API 3. 上传PDF 4. 生成卡片 5. 开始学习 | 每步操作成功，学习记录正确保存 |
| E2E-002 | 日常学习流程     | 1. 打开应用 2. 查看待复习 3. 完成学习 4. 查看统计         | 统计数据正确更新               |
| E2E-003 | 贴笺学习流程     | 1. 打开文档 2. 查看侧边卡片 3. 点击卡片跳转 4. 创建新卡片 | 跳转正确，新卡片显示在侧边     |
| E2E-004 | 中断恢复流程     | 1. 生成卡片中途退出 2. 重启应用 3. 恢复任务               | 任务可恢复且无重复写入         |

**MVP验收清单：**

```
MVP验收清单
===========

[ ] 平台基础模块
    [ ] SQLite / Stronghold / 任务恢复测试通过

[ ] 文档导入与锚点模块
    [ ] U-DOC-001 ~ U-DOC-006 单元测试通过
    [ ] I-DOC-001 ~ I-DOC-003 集成测试通过

[ ] 卡片生产线模块
    [ ] U-GEN-001 ~ U-GEN-006 单元测试通过
    [ ] I-GEN-001 ~ I-GEN-004 集成测试通过

[ ] 阅读与贴笺模块
    [ ] U-STK-001 ~ U-STK-003 单元测试通过
    [ ] U-HL-001 ~ U-HL-005 单元测试通过
    [ ] I-STK-001 ~ I-STK-003 集成测试通过
    [ ] I-HL-001 ~ I-HL-002 集成测试通过

[ ] 学习调度模块
    [ ] U-FRS-001 ~ U-FRS-005 单元测试通过
    [ ] I-FRS-001 ~ I-FRS-002 集成测试通过

[ ] 渲染与反馈模块
    [ ] U-MD-001 ~ U-MD-005 单元测试通过
    [ ] U-STS-001 ~ U-STS-003 单元测试通过
    [ ] I-STS-001 集成测试通过

[ ] BYOK与端到端
    [ ] U-API-001 ~ U-API-006 单元测试通过
    [ ] U-RUN-001 ~ U-RUN-002 单元测试通过
    [ ] E2E-001 ~ E2E-004 通过

测试覆盖率要求：核心功能 > 80%
```

### 5.2 V2验收

V2的成功标准是"在MVP闭环上新增问答、积分和多格式导入，但不破坏原有学习体验"。V2以关键场景验收和新增能力的集成测试为主。

**验收场景：**

| 场景ID    | 场景                           | 预期结果                                       |
| --------- | ------------------------------ | ---------------------------------------------- |
| V2-RAG-01 | 选定知识范围进行问答           | 返回答案并附带引用来源                         |
| V2-RAG-02 | embedding不可用时回退FTS5      | 仍能返回可接受答案，且明确检索模式降级         |
| V2-RAG-03 | 不同知识范围隔离               | 回答不串文档、不越界引用                       |
| V2-RAG-04 | sqlite-vec 向量存储            | 向量正确存储、检索和相似度计算                 |
| V2-RAG-05 | RRF 混合检索                   | FTS5 + 向量结果正确融合排序                    |
| V2-RAG-06 | sqlite-vec 扩展加载失败        | 自动降级为纯 FTS5，记录错误日志                |
| V2-IMP-01 | 导入MD/TXT/DOCX                | 文档成功标准化并进入卡片生成流程               |
| V2-IMP-02 | 无坐标文档的锚点降级           | 使用paragraph/text-range锚点仍可回跳           |
| V2-PTS-01 | 学习行为生成积分               | 账本正确记账，不重复累计                       |
| V2-PTS-02 | 异常重复提交                   | 不发生刷分，重复事件被拦截                     |

**重点测试：**

- RAG检索正确性、引用回溯、知识源隔离
- sqlite-vec 集成、向量存储与检索
- 混合检索（RRF）与降级策略
- 多格式文档导入与锚点降级策略
- 积分账本、防重复记账、撤销场景

### 5.3 V3验收

V3的成功标准是“多媒体能力可用、可恢复、可控成本”，而不是单纯能生成一次结果。

**验收场景：**

| 场景ID    | 场景                     | 预期结果                                 |
| --------- | ------------------------ | ---------------------------------------- |
| V3-ANI-01 | 从卡片生成动画           | 任务成功，产出脚本与预览资源             |
| V3-ANI-02 | 动画生成失败             | 任务失败可回退，可重新生成，不污染资源   |
| V3-POD-01 | 生成播客脚本             | 输出结构化提纲和对话脚本                 |
| V3-POD-02 | 生成播客音频             | 音频片段拼接成功，节目可播放             |
| V3-RUN-01 | 长任务中断恢复           | 动画或播客任务可从checkpoint恢复         |
| V3-COST-01| 超预算停止               | 任务按预算策略中止，保留中间状态与原因   |

**重点测试：**

- 动画生成成功率与失败回退
- 资源文件清理与二次生成覆盖策略
- 播客脚本生成、音频拼接和长任务恢复
- 预算控制和错误可解释性

### 5.4 V4验收

V4的成功标准是“知识结构化能力可信、跨端评估结论明确”，不以正式移动端上线作为验收条件。

**验收场景：**

| 场景ID    | 场景                       | 预期结果                                   |
| --------- | -------------------------- | ------------------------------------------ |
| V4-KG-01  | 构建知识图谱               | 生成节点与关系，且可追溯来源               |
| V4-KG-02  | 增量更新图谱               | 新增文档后可更新图谱，不破坏既有结构       |
| V4-KG-03  | 实体去重与消歧             | 同义概念合并合理，错误合并可修正           |
| V4-UX-01  | 切换主题包与回退主题       | 样式变化生效，不影响阅读与学习效率         |
| V4-AND-01 | Android能力评估            | 输出能力矩阵、阻塞项和迁移建议             |

**重点测试：**

- 图谱构建质量、实体去重、增量更新
- 主题系统的可访问性和性能影响
- Android兼容性检查，不承诺正式移动端交付

---

## 六、开发实施计划

### 6.1 依赖包清单

**生产依赖：**

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",

    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-dropdown-menu": "^2.0.0",
    "@radix-ui/react-tabs": "^1.0.0",
    "@radix-ui/react-tooltip": "^1.0.0",
    "tailwindcss": "^3.4.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",

    "ts-fsrs": "^4.1.0",
    "pdfjs-dist": "^4.0.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "remark-math": "^6.0.0",
    "rehype-katex": "^7.0.0",
    "rehype-highlight": "^7.0.0",
    "katex": "^0.16.0",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-virtual": "^3.0.0",
    "zustand": "^4.5.0",
    "@langchain/langgraph": "^0.2.0",
    "@langchain/core": "^0.3.0",
    "openai": "^4.0.0",
    "@anthropic-ai/sdk": "^0.27.0",
    "@tauri-apps/api": "^2.0.0",
    "idb": "^8.0.0"
  }
}
```

**开发依赖：**

```json
{
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",

    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@playwright/test": "^1.40.0",

    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "prettier": "^3.0.0"
  }
}
```

**Rust核心依赖：**

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-stronghold = "2"
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
rusqlite = { version = "0.32", features = ["bundled", "functions", "load_extension"] }
sqlite-vec = { version = "0.1", features = ["bundled"] }  # V2: 向量存储扩展
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
uuid = { version = "1", features = ["v4", "serde"] }
```

### 6.2 MVP阶段（预计4周）

**第1周：基础架构与数据层**

- [ ] 项目初始化（Tauri + React + Vite + Rust core）
- [ ] 配置Tailwind CSS + Radix Primitives + 默认设计Token
- [ ] 接入字体资源、纸感纹理、手绘线条规则与桌面多栏壳层
- [ ] 实现SQLite数据库初始化、迁移与FTS5索引
- [ ] 实现Stronghold密钥存储和基础Repository层
- [ ] 编写数据层单元测试

**第2周：Host 网关与 Python 编排服务**

- [ ] 实现 `ModelGateway / ToolGateway`
- [ ] 实现 `Python Orchestration Service` 基础设施与健康检查
- [ ] 实现预设工作流注册、`Orchestration Protocol` 与 `WorkflowCheckpoint` 持久化
- [ ] 实现任务事件流、取消与恢复能力
- [ ] 编写相关测试

**第3周：文档处理与学习核心功能**

- [ ] 实现PDF上传功能
- [ ] 实现PDF.js集成、文本提取与锚点建模
- [ ] 实现文档转卡片Agent
- [ ] 实现FSRS调度算法
- [ ] 实现贴笺展示功能
- [ ] 实现卡片学习界面与基础学习统计
- [ ] 编写相关测试

**第4周：整合与测试**

- [ ] 实现BYOK配置界面与模型连接测试
- [ ] 整合统计、导出、任务恢复与错误处理
- [ ] 编写E2E测试
- [ ] Bug修复与优化
- [ ] 打包测试

### 6.3 V2阶段（预计3周）

**阶段目标：**

- 在MVP学习闭环稳定的基础上，引入知识库问答、积分激励与多格式文档导入
- 扩展能力必须复用MVP已有的数据层、锚点模型与 Host / Protocol 边界，不重写底层

**依赖前提：**

- SQLite / FTS5 / Stronghold / 工作流恢复能力已稳定
- `Document`、`DocumentAnchor`、`Card`、`ReviewLog` 等核心模型已固定
- `ModelGateway`、`ToolGateway` 与 `Python Orchestration Service` 已支持稳定的预设工作流

**开发重点：**

- 知识库问答（RAG）：集成 sqlite-vec 向量存储、embedding 生成与混合检索
- 积分系统
- 更多文档格式支持（MD/TXT/DOCX）
- 新增引用回溯、知识范围配置和积分账本

**验收出口：**

- 用户可对指定知识范围进行问答并获得引用
- sqlite-vec 向量索引可用，支持 FTS5 + 向量混合检索
- 无 embedding 时可降级为纯 FTS5 检索
- 用户可导入非PDF文档并继续走卡片生产线
- 积分系统不重复记账，且不破坏原有学习流程

### 6.4 V3阶段（预计4周）

**阶段目标：**

- 把知识内容扩展为可视化和音频化学习材料
- 所有长任务继续遵循“可恢复、可取消、可预算控制”的统一模型

**依赖前提：**

- V2的知识范围、RAG和多格式导入已稳定
- 长任务恢复、文件落盘与预算控制机制可复用

**开发重点：**

- 卡片内容动画生成
- AI播客生成
- 多媒体资源管理、失败回退和二次生成覆盖

**验收出口：**

- 用户可从卡片生成动画并预览结果
- 用户可从知识范围生成播客脚本与音频
- 动画与播客任务中断后可恢复，失败后可重新执行

### 6.5 V4阶段（预计3周）

**阶段目标：**

- 将知识材料进一步结构化为知识图谱，并在既有默认视觉基线上补齐主题切换与跨端规划

**依赖前提：**

- 文档、卡片、问答、播客等数据都已稳定入库
- MVP 默认设计系统、页面壳层与平台能力抽象具备扩展条件

**开发重点：**

- 知识图谱
- 主题切换与扩展主题包
- Android能力适配评估

**验收出口：**

- 图谱可构建、可增量更新、可回溯来源
- 主题切换与扩展主题包上线后不降低核心学习可用性
- 输出Android迁移方案、阻塞项和优先级建议

---

## 七、约束条件

### 7.1 技术约束

| 约束项            | 说明                                              |
| ----------------- | ------------------------------------------------- |
| 桌面端安装包      | Windows版本 < 60MB                                |
| 内存占用          | < 500MB（正常使用）                               |
| API响应时间       | 卡片生成 < 30秒/批，流式首包 < 3秒                |
| 本地数据库        | 单文件 < 10GB                                     |
| 主存储            | SQLite为唯一真源，禁止以IndexedDB替代主数据库     |
| Agent运行方式     | 首版仅支持内置预设Agent，不支持用户自定义工作流图 |
| 跨端约束          | 首版桌面优先，但必须保持 Android 协议复用路径，不强绑定同一种进程拓扑 |
| 视觉基线          | MVP 默认桌面视觉固定为“极简学术感 + 中度手绘漫画风格” |

### 7.2 性能优化策略

| 场景             | 优化策略             | 技术实现                           |
| ---------------- | -------------------- | ---------------------------------- |
| 卡片列表渲染     | 虚拟滚动             | @tanstack/react-virtual            |
| PDF大文件        | 分页加载 + 页面缓存  | PDF.js按页渲染 + IndexedDB缓存     |
| 数据库查询       | 索引优化 + FTS5      | SQLite索引、FTS5、分页查询         |
| AI长任务         | 后台执行 + 断点恢复  | `WorkflowCheckpoint` + Host任务层 + Python服务 |
| 图片/音频加载    | 懒加载 + 文件引用    | Intersection Observer + 文件系统   |
| 状态管理         | 选择性订阅           | Zustand selector                   |
| 数据获取         | 查询缓存与失效控制   | TanStack Query                     |
| 视觉纹理与装饰   | 低对比度纸感纹理     | 纹理透明度控制 + Token化装饰开关   |

**视觉边界：**

- 全站共享统一风格，但 PDF 正文、卡片正文、设置表单必须优先保证清晰阅读
- 禁止使用高噪声纹理、重彩色面板、夸张手写体污染核心学习工作区
- 手绘装饰只用于壳层、按钮、分隔线、标记和卡片表面，不得替代关键功能反馈

### 7.3 业务约束

| 约束项   | 说明                               |
| -------- | ---------------------------------- |
| 数据隐私 | 所有用户数据本地存储，不上传服务器 |
| API成本  | 用户自行承担API调用费用            |
| 开源协议 | MIT License                        |

### 7.4 开发约束

| 约束项   | 说明              |
| -------- | ----------------- |
| 代码规范 | ESLint + Prettier |
| 测试覆盖 | 核心功能 > 80%    |
| 文档要求 | API文档、用户手册 |
| 版本管理 | Git + 语义化版本  |

### 7.5 首版用户配置边界

- 用户可以配置：模型、提供商、默认知识源、提示词模板、工具开关、预算限制
- 用户不可以配置：任意代码执行、自定义Agent拓扑、可视化节点编排、外部任意插件
- 首版配置目标是“可用且友好”，不是“低代码Agent平台”

---

## 八、风险与缓解措施

### 8.1 MVP阶段风险

| 风险                | 影响                     | 概率 | 缓解措施                                    |
| ------------------- | ------------------------ | ---- | ------------------------------------------- |
| LLM API调用不稳定   | 卡片生成失败             | 中   | 重试机制、任务恢复、错误提示、预算中止      |
| PDF解析兼容性问题   | 部分文档无法处理         | 中   | 降级到文本提取、用户手动录入、问题文档标记  |
| FSRS参数冷启动      | 新用户体验差             | 低   | 使用默认参数、渐进优化                      |
| PDF.js渲染性能      | 大文件卡顿               | 低   | 分页加载、虚拟滚动、页面缓存                |
| 工作流中断恢复     | 长任务丢失或重复写入     | 中   | `WorkflowCheckpoint`、幂等写入、恢复状态机  |
| 模型供应商差异      | 输出结构不稳定、体验分裂 | 中   | ModelGateway归一化、预设约束、连接测试      |
| PDF锚点漂移         | 卡片与原文错位           | 中   | quote + rect + hash 多重锚定、手动重绑工具  |
| Python服务进程边界 | IPC/RPC、部署与运维复杂度上升 | 中 | 固定 Host / Protocol 边界、健康检查、版本握手 |
| 桌面到Android迁移约束 | 后续移动端复用成本上升 | 中   | 强制协议复用，隔离平台相关能力与进程形态    |
| 视觉过度装饰        | 阅读效率下降、界面失焦   | 中   | 默认中度风格、正文区克制、装饰仅限壳层与强调 |
| 中文字体渲染差异    | Windows端排版不稳定      | 中   | 锁定字体槽位、预留回退栈、逐页验证阅读场景   |
| 纸感纹理与特效性能  | 滚动卡顿、模糊渲染异常   | 低   | 低透明度纹理、位图尺寸控制、按页面懒加载     |
| 主题回退失效        | 可访问性下降             | 低   | 保留默认主题、回退模式和无障碍对比测试       |

### 8.2 技术依赖风险

| 依赖项         | 风险描述                    | 应对方案                                  |
| -------------- | --------------------------- | ----------------------------------------- |
| PDF.js         | 某些PDF格式不支持           | 提供错误提示，支持手动创建卡片            |
| Tauri 2.0      | 桌面端兼容性问题            | 充分测试多平台，保留降级方案              |
| Python Orchestration Service | 新增本地服务进程与协议复杂度 | Host 统一边界、服务健康检查、协议版本控制 |
| LangChain      | 工作流抽象收敛不足或模板漂移 | 固定 `PresetWorkflow` 口径、约束结构化输出 |
| SQLite FTS5    | 仅关键词检索，语义能力有限  | V2引入embedding与混合检索                 |
| FSRS算法       | 参数优化需要数据            | 初始使用默认参数，收集数据后优化          |
| Stronghold     | 密钥迁移与调试门槛较高      | 封装统一密钥服务，提供开发环境模拟接口    |

---

## 九、下一步行动

1. **初始化核心工程** - 创建Tauri 2 + React 19 + Vite + Rust core项目骨架
2. **建立默认设计系统** - 完成字体槽位、设计Token、纸感壳层与手绘细墨线基础组件
3. **落地主数据库** - 完成SQLite schema、迁移、FTS5索引与基础仓库
4. **接入密钥与模型网关** - 完成Stronghold封装、BYOK配置与多模型适配
5. **搭建AI编排基础设施** - 完成 Python 服务、协议封装、预设工作流注册与 `WorkflowCheckpoint`
6. **开发第一个闭环功能** - 实现PDF上传、锚点提取与文档转卡片Agent
7. **编写第一轮测试** - 覆盖数据库、密钥存储、Agent恢复、文档解析与默认视觉验收

---

_文档版本：v3.4_
_创建日期：2026-04-15_
_最后更新：2026-04-16_
_更新内容：文档架构优化 - 精简 v2-1-rag.md 模块文档至标准格式（~100行），新增 docs/design/ 设计文档目录（components.md、pages.md），技术选型与数据库 Schema 保持在本规范文档中_
