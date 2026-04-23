# 学笺前端系统扩展设计文档（总览）

> 本文档为学笺（XueJian）桌面应用前端系统扩展设计的**总览文档**，涵盖信息架构、后端数据打通方案、组件库扩展、状态管理更新、迁移策略及实施路线图。9 个功能页面的**详细设计规格**见 [`/docs/design/`](./design/) 目录下的各页面文档。所有设计严格遵循现有纸感手绘风格（paper-texture / sketch-border / LXGW WenKai），不改变任何设计令牌或视觉语言。

---

## 设计令牌速查

本文档及所有子页面文档统一使用以下令牌体系（源自 `src/design-system/tokens.ts`）：

| 类别 | 令牌 | 用途 |
|------|------|------|
| **圆角** | `rounded-panel`(20px) | 面板/大容器 |
| | `rounded-card`(16px) | 卡片/列表项 |
| | `rounded-item`(12px) | 小组件/徽章 |
| | `rounded-sketch`(2px) | 手绘风格元素 |
| | `rounded-full` | 按钮/头像/标签 |
| **Surface** | `Panel variant="paperCard"` | 白底卡片 |
| | `Panel variant="panel"` | 灰底面板 |
| | `Panel variant="stickyNote"` | 黄色便笺 |
| | `Panel variant="canvas"` | 画布底色 |
| | `Panel variant="modal"` | 弹窗 |
| **字体** | `font-display` | 标题/大数字（Kose/Xiaolai） |
| | `font-ui` | 标签/小字/按钮（Yozai） |
| | `font-body` | 正文/描述（LXGW WenKai） |
| | `font-latin-meta` | 英文元数据（Inter） |
| **色彩** | `text-ink` / `text-ink-muted` / `text-ink-soft` | 文字三级灰度 |
| | `bg-paper-base` / `bg-paper-muted` / `bg-paper-card` | 背景三级 |
| | `border-line-soft` | 边框 |
| | `bg-highlight-yellow/green/blue/pink` | 高亮色 |
| **Sketch** | `RoughCircleNumber` | 手绘圆圈强调数字 |
| | `RoughUnderline` | 手绘下划线装饰 |
| | `SketchEmptyState` | 统一空状态插画 |
| | `SketchProgress` | 手绘进度条 |
| | `SketchCard` / `SketchBorder` / `SketchButton` | 手绘卡片/边框/按钮 |

---

## 目录

1. [信息架构](#1-信息架构)
2. [页面规格总览](#2-页面规格总览) → 详细见 [/docs/design/](./design/)
3. [后端数据打通](#3-后端数据打通)
4. [组件库扩展](#4-组件库扩展)
5. [状态管理更新](#5-状态管理更新)
6. [迁移策略](#6-迁移策略)
7. [实施路线图](#7-实施路线图)

### 页面详细设计文档

| 页面 | 文档 | 核心变更 |
|------|------|----------|
| 首页 | [`01-home-page.md`](./design/01-home-page.md) | 替换旧 DashboardPage，接入真实数据 |
| 文档库 | [`02-library-page.md`](./design/02-library-page.md) | 增加搜索/筛选/排序 |
| 卡片工坊 | [`03-card-studio-page.md`](./design/03-card-studio-page.md) | 新增卡片库 Tab |
| 学习 | [`04-review-page.md`](./design/04-review-page.md) | 完成屏幕优化 |
| 知识问答 | [`05-knowledge-qa-page.md`](./design/05-knowledge-qa-page.md) | 对话持久化/导出 |
| 知识图谱 | [`06-knowledge-graph-page.md`](./design/06-knowledge-graph-page.md) | 替代旧 GraphPage |
| 播客工坊 | [`07-podcast-page.md`](./design/07-podcast-page.md) | 新增我的播客 Tab |
| 我的 | [`08-profile-page.md`](./design/08-profile-page.md) | 完全重写，接入真实数据 |
| 设置 | [`09-settings-page.md`](./design/09-settings-page.md) | 左侧子导航重构 |

---

## 1. 信息架构

### 1.1 导航结构

最终侧边栏导航为 9 项完整版：

```typescript
// src/store/ui.ts — NavItemId 更新

export type NavItemId =
  | 'home'        // 首页（学习中心）
  | 'library'     // 文档库
  | 'cards'       // 卡片工坊
  | 'learning'    // 学习（复习）
  | 'knowledge'   // 知识问答
  | 'graph'       // 知识图谱
  | 'podcast'     // 播客工坊
  | 'profile'     // 我的（统计）
  | 'settings'    // 设置
```

**变更摘要**：
- 新增 `'profile'` 导航项，指向改造后的 ProfilePage
- `'graph'` 导航项从旧 `GraphPage` 切换到 `KnowledgeGraphPage`
- 删除旧 `DashboardPage`，`'home'` 导航项指向新首页组件

### 1.2 侧边栏布局

```
┌──────┐
│  笺  │  ← Logo
├──────┤
│  🏠  │  home      首页
│  📚  │  library   文档库
│  🃏  │  cards     卡片工坊
│  ✏️  │  learning  学习
│  ❓  │  knowledge 知识问答
│  🕸️  │  graph     知识图谱
│  🎙️  │  podcast   播客工坊
├──────┤  ← 分隔线
│  👤  │  profile   我的
│  ⚙️  │  settings  设置
└──────┘
```

**设计细节**：
- `profile` 和 `settings` 之间无分隔线，但与上方功能区之间有细线分隔
- 图标使用现有 SVG 手绘风格，`profile` 使用人形轮廓图标
- `profile` 导航项在无学习记录时显示为 `text-ink-soft` 弱化状态

### 1.3 页面流转图

```
                         ┌──────────┐
                         │   首页    │
                         │ (学习中心) │
                         └────┬─────┘
              ┌────────┬──────┼──────┬────────┐
              ▼        ▼      ▼      ▼        ▼
          ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
          │文档库│ │卡片  │ │学习  │ │知识  │ │播客  │
          │      │ │工坊  │ │      │ │问答  │ │工坊  │
          └──┬───┘ └──────┘ └──────┘ └──────┘ └──────┘
             │
             ▼
          ┌──────┐                ┌──────┐
          │阅读器│                │知识  │
          │      │                │图谱  │
          └──────┘                └──────┘

     ┌──────┐  ┌──────┐
     │ 我的 │  │ 设置 │
     └──────┘  └──────┘
```

**关键流转规则**：
- 首页 → 任意功能页：直接切换
- 文档库 → 阅读器：`openReader(documentId)` 进入全屏阅读模式
- 阅读器 → 文档库：`closeReader()` 返回
- 学习完成 → 首页/我的：`setActiveNavItem('home')` 或 `setActiveNavItem('profile')`
- 任意页 → 设置：`setActiveNavItem('settings')`
- 无 API 配置时：不锁定导航；通过顶部提示、提醒卡和 Settings CTA 引导用户补齐配置

### 1.4 用户旅程

#### 1.4.1 新用户首次使用

```
启动应用
  → 检测无 api_config → 显示顶部提示与 BYOK 引导 CTA（不强制跳转）
  → 配置 API Key → 连接测试通过
  → 自动跳转首页
  → 首页显示空状态："导入第一份文档开始学习"
  → 用户点击"导入文档" → 切换到文档库
  → 文档处理完成 → 首页"最近文档"出现条目
  → 用户点击"开始学习" → 进入复习页
```

#### 1.4.2 日常学习流程

```
打开应用 → 首页
  → 看到"今日待复习 N 张" → 点击"开始学习"
  → 复习页 intro → 开始学习 → 逐张复习 → 完成
  → 完成页显示统计 → 返回首页
  → 首页更新：待复习清零，积分增加
```

#### 1.4.3 文档→卡片→学习闭环

```
文档库 → 导入 PDF → 等待处理
  → 处理完成 → 卡片工坊 → 选择文档 → 启动卡片生成
  → 生成完成 → 审阅候选卡 → 接受/拒绝
  → 接受的卡片进入学习队列 → 学习页复习
```

#### 1.4.4 知识探索流程

```
知识问答 → 输入问题 → 选择文档范围 → AI 回答（含引用）
  → 点击引用 → 打开阅读器跳转到对应页
  → 或：切换到知识图谱 → 浏览概念关系 → 点击节点查看详情
```

#### 1.4.5 播客生成流程

```
播客工坊 → 选择文档 → 配置参数（风格/时长/语言）
  → 启动生成 → 等待（排队→检索→大纲→脚本→评估→音频→拼接）
  → 生成完成 → 播放器收听 → 或下载
```

#### 1.4.6 AI/BYOK 缺配置时的统一行为

- 页面访问权限与 AI 能力可执行性必须分离描述。
- 缺少 AI/BYOK 配置时，Home、Library、Reader、Cards、Knowledge、Graph、Podcast、Profile、Settings 都允许进入和浏览。
- 仅真正发起 AI 调用的动作受限，例如提问、启动图谱生成、启动播客生成、启动卡片生成、需要可用配置的 workflow assignment。
- 受限动作统一表现为按钮置灰或内联 notice，不自动跳转 Settings，不改写其他导航，不打断当前浏览上下文。
- 从业务页进入 Settings 后，应允许用户返回原页面或保留原来源上下文。

---

## 2. 页面规格总览

> 以下为各页面的简要规格概述。完整设计规格见 [`/docs/design/`](./design/) 目录。

### 2.1 首页（HomePage）

#### 2.1.1 概述

替换旧 `DashboardPage`，使用 `components/home/` 下已有组件，全部接入真实后端数据。首页定位为**学习中心**，聚合今日任务、学习统计、最近文档和快捷入口。

#### 2.1.2 布局线框图

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AppShell                                                                │
├──┬──────────────────────────────────────────────────────────────┬──────┤
│  │ TopBar: 首页 | 学笺                          待复习: N 张    │      │
│  ├──────────────────────────────────────────────────────────────┤      │
│  │                                                              │      │
│  │ ┌──────────────────────────────────────────────────────────┐ │      │
│  │ │ HomeTaskHero                                             │ │      │
│  │ │  ┌─────┐  今日学习中心                                    │ │  右  │
│  │ │  │  N  │  先收束待复习，再接入新知识...                     │ │  侧  │
│  │ │  │ 待复│  [开始学习]  12 待复习 · 5 新知识  今日积分 +30   │ │  栏  │
│  │ │  │  习 │                                                 │ │      │
│  │ │  └─────┘  ┌──────┐ ┌──────┐                            │ │  X   │
│  │ │           │待复习│ │新知识│  Rhythm Note               │ │  L   │
│  │ │           │ 12   │ │  5   │  先整理复习...              │ │  只   │
│  │ │           └──────┘ └──────┘                            │ │  显   │
│  │ └──────────────────────────────────────────────────────────┘ │  示   │
│  │                                                              │      │
│  │ ┌──────────────────────────┐ ┌────────────────────────────┐ │      │
│  │ │ HomeStudyOverviewPanel   │ │ HomeHeatmapPanel           │ │      │
│  │ │  学习概览                │ │  学习热力图                │ │      │
│  │ │  ┌────┐┌────┐┌────┐┌──┐│ │  ┌──────────────────────┐  │ │      │
│  │ │  │今日││本周││总时││连││ │  │  ▓▓░░▓▓▓░▓░░▓▓▓▓░░  │  │ │      │
│  │ │  │ 25 ││180 ││42h││7 ││ │  │  ░▓▓░░▓░▓▓▓░░▓▓░▓▓  │  │ │      │
│  │ │  │分钟││分钟││   ││天 ││ │  └──────────────────────┘  │ │      │
│  │ │  └────┘└────┘└────┘└──┘│ │                              │ │      │
│  │ └──────────────────────────┘ └────────────────────────────┘ │      │
│  │                                                              │      │
│  │ ┌──────────────────────────┐ ┌────────────────────────────┐ │      │
│  │ │ HomeRecentDocumentsPanel │ │ HomeQuickActionsPanel      │ │      │
│  │ │  最近文档                │ │  快速开始                  │ │      │
│  │ │  ┌──────────────────┐   │ │  ┌──────┐ ┌──────┐        │ │      │
│  │ │  │ 📄 机器学习基础  →│   │ │  │进入  │ │文档库│        │ │      │
│  │ │  │ 📄 深度学习笔记  →│   │ │  │学习  │ │      │        │ │      │
│  │ │  │ 📄 算法导论      →│   │ │  ├──────┤ ├──────┤        │ │      │
│  │ │  └──────────────────┘   │ │  │卡片  │ │知识  │        │ │      │
│  │ └──────────────────────────┘ │  │工坊  │ │问答  │        │ │      │
│  │                              │  └──────┘ └──────┘        │ │      │
│  │                              │  [导入文档]               │ │      │
│  │                              └────────────────────────────┘ │      │
│  └──────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

**响应式规则**：
- `xl+`：主区 + 右侧栏（HomeInsightRail）双栏布局
- `lg`：主区单栏，右侧栏隐藏
- `sm/md`：所有面板纵向堆叠

#### 2.1.3 组件树

```
HomePage
├── HomeTaskHero              ← 已有，需接入真实数据
│   ├── RoughCircleNumber     ← 已有
│   ├── SketchBorder          ← 已有
│   └── HeroCircleMetric      ← 已有
│
├── 主内容区（双栏 grid）
│   ├── 左栏
│   │   ├── HomeStudyOverviewPanel   ← 已有，需接入真实数据
│   │   │   └── StudyTotalsCard      ← 已有
│   │   ├── HomeHeatmapPanel         ← 已有，需接入真实数据
│   │   │   └── HeatmapCalendar      ← 已有
│   │   ├── HomeRecentDocumentsPanel ← 已有，需接入真实数据
│   │   └── HomeQuickActionsPanel    ← 已有
│   │
│   └── 右栏（xl+ only）
│       └── HomeInsightRail          ← 已有，需接入真实数据
│           ├── Panel (Desk Note)
│           ├── Panel (Weekly Signal)
│           └── Panel (Workbench State)
```

#### 2.1.4 数据绑定

| 组件 | 数据项 | 当前来源 | 目标来源 | 所需后端命令 |
|------|--------|----------|----------|-------------|
| HomeTaskHero | totalDue, reviewCards, newCards | 无（需传入） | `useDailyStatsQuery()` | `get_daily_stats`（已有） |
| HomeTaskHero | todayPoints | 无 | `usePointsSummaryQuery()` | `get_points_summary`（已有） |
| HomeStudyOverviewPanel | todayMinutes, weekMinutes, totalMinutes, streakDays | 无 | `useStudyStatsQuery()` | **`get_study_stats`（新增）** |
| HomeHeatmapPanel | entries: HeatmapEntry[] | 无 | `useReviewHeatmapQuery()` | **`get_review_heatmap`（新增）** |
| HomeRecentDocumentsPanel | documents, isLoading | 无 | `useDocumentsQuery()`（已有） | 已有 |
| HomeInsightRail | activeDays, weekMinutes, streakDays, todayPoints, recentDocumentsCount, hasApiConfig | 无 | 组合查询 | 组合已有+新增 |

#### 2.1.5 状态设计

**空状态**（首次使用、无文档无卡片）：
```
┌──────────────────────────────────────┐
│                                      │
│        ┌─────┐                       │
│        │  0  │  今日学习中心          │
│        │ 待复│                        │
│        │  习 │  今日复习已经清空。    │
│        └─────┘  现在更适合回到文档库  │
│                                      │
│        [导入第一份文档]               │
│                                      │
└──────────────────────────────────────┘
```

**加载状态**：各面板独立 skeleton，不阻塞整页渲染。

**错误状态**：面板内显示内联错误提示 + 重试按钮，不影响其他面板。

---

### 2.2 文档库（LibraryPage）

#### 2.2.1 概述

保持现有实现，文档库页面已完整接入后端数据（`useDocumentsQuery`）。本节仅记录现状和微小优化点。

#### 2.2.2 现有组件树

```
LibraryPage（已有，保持不变）
├── ImportDocumentButton       ← 已有
├── DocumentGrid / DocumentList ← 已有
│   └── DocumentCard           ← 已有
│       └── DocumentStatusBadge ← 已有
└── 空状态提示                  ← 已有
```

#### 2.2.3 优化点

- 添加文档搜索/筛选功能（按标题搜索、按状态筛选）
- 添加排序选项（按上传时间、按标题、按页数）
- 文档卡片增加"生成卡片"快捷操作按钮

---

### 2.3 卡片工坊（CardStudioPage）

#### 2.3.1 概述

当前 CardStudioPage 已接入后端数据，但缺少独立的卡片浏览/编辑视图。用户只能在工作流运行上下文中查看候选卡，无法浏览已接受的卡片库。

#### 2.3.2 增强布局线框图

```
┌─────────────────────────────────────────────────────────────┐
│ 卡片工坊                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Tab Bar ─────────────────────────────────────────────┐  │
│ │ [生成工坊]  [卡片库]                                   │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ── 生成工坊 Tab（现有功能）──                              │
│                                                             │
│ ┌─────────────────────┐  ┌──────────────────────────────┐  │
│ │ 文档选择 & 工作流    │  │ 候选卡列表                  │  │
│ │                     │  │                              │  │
│ │ 📄 选择文档 ▼       │  │ ┌────┐ ┌────┐ ┌────┐       │  │
│ │ 运行 #3 [查看]      │  │ │ ✅ │ │ ⏳ │ │ ❌ │       │  │
│ │ 限制: 24 张         │  │ │卡1 │ │卡2 │ │卡3 │       │  │
│ │                     │  │ └────┘ └────┘ └────┘       │  │
│ │ [启动生成]          │  │                              │  │
│ └─────────────────────┘  │ 接受: 12  拒绝: 3  待定: 9  │  │
│                          └──────────────────────────────┘  │
│                                                             │
│ ── 卡片库 Tab（新增）──                                    │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 筛选: [全部状态 ▼] [按文档 ▼] [按类型 ▼]  搜索: ___ │   │
│ ├──────────────────────────────────────────────────────┤   │
│ │                                                      │   │
│ │ ┌────────────────┐ ┌────────────────┐ ┌────────────┐ │   │
│ │ │ Q: 什么是反向传播│ │ Q: 梯度消失的  │ │ Q: CNN 的  │ │   │
│ │ │ A: 反向传播是一 │ │   原因是什么？ │ │   池化层...│ │   │
│ │ │ ...            │ │ A: 梯度消失是  │ │ A: 池化层  │ │   │
│ │ │ 状态: learning │ │ ...           │ │ ...        │ │   │
│ │ │ 来源: ML基础 p12│ │ 状态: review  │ │ 状态: new  │ │   │
│ │ │ [编辑] [删除]  │ │ 来源: DL笔记 p5│ │ [编辑]     │ │   │
│ │ └────────────────┘ └────────────────┘ └────────────┘ │   │
│ │                                                      │   │
│ │ ┌────────────────┐ ┌────────────────┐               │   │
│ │ │ ...            │ │ ...            │               │   │
│ │ └────────────────┘ └────────────────┘               │   │
│ │                                                      │   │
│ │ 共 156 张 · 已加载 40 张 · [加载更多]               │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 2.3.3 新增组件树

```
CardStudioPage（增强）
├── TabBar                    ← 新增：生成工坊 / 卡片库 切换
│
├── 生成工坊 Tab
│   └── （现有组件保持不变）
│
└── 卡片库 Tab                ← 新增
    ├── CardLibraryFilters    ← 新增：状态/文档/类型筛选 + 搜索
    ├── CardLibraryGrid       ← 新增：已接受卡片网格
    │   └── CardLibraryCard   ← 新增：卡片浏览卡片（含编辑/删除操作）
    └── CardLibraryPagination ← 新增：分页/无限滚动
```

#### 2.3.4 数据绑定

| 组件 | 数据项 | 来源 | 所需后端命令 |
|------|--------|------|-------------|
| CardLibraryGrid | 已接受卡片列表 | `useAcceptedCardsQuery()` | **`list_accepted_cards`（新增）** |
| CardLibraryCard | 单张卡片详情 | 已有 Card 类型 | 已有 |
| CardLibraryFilters | 文档列表（筛选用） | `useDocumentsQuery()` | 已有 |

---

### 2.4 学习页（ReviewPage）

#### 2.4.1 概述

当前 ReviewPage 已完整接入后端（`useDueCardsQuery`、`useSubmitReviewMutation`），交互完善。仅需优化完成屏幕的统计展示。

#### 2.4.2 优化点

- 完成屏幕增加"查看我的统计"按钮，跳转 `profile` 而非 `settings`
- 完成屏幕增加本次会话的积分获得提示
- 键盘快捷键提示更明显（首次使用时显示浮动提示）

---

### 2.5 知识问答页（KnowledgeQaPage）

#### 2.5.1 概述

当前 KnowledgeQaPage 已完整接入后端，交互完善。本节仅记录现状。

#### 2.5.2 优化点

- 增加对话历史持久化（当前刷新后丢失）
- 增加对话导出功能（Markdown 格式）
- 引用卡片增加"在图谱中查看"链接

---

### 2.6 知识图谱页（KnowledgeGraphPage）

#### 2.6.1 概述

当前 `KnowledgeGraphPage`（`features/knowledge/`）是完整实现，使用 graphology + sigma 渲染，已接入后端。旧 `GraphPage`（`features/graph/`）使用 canvas + mock 数据，需删除。

#### 2.6.2 变更

- 侧边栏 `graph` 导航项从 `GraphPage` 切换到 `KnowledgeGraphPage`
- 删除 `features/graph/GraphPage.tsx` 及其目录
- `App.tsx` 中 `activeNavItem === 'graph'` 渲染 `KnowledgeGraphPage`

#### 2.6.3 优化点

- 增加图谱缩略图组件，可嵌入首页（可选，后续迭代）
- 增加节点搜索功能（当前已有部分实现）
- 增加"从问答跳转到图谱节点"的跨页联动

---

### 2.7 播客工坊（PodcastPage）

#### 2.7.1 概述

当前 PodcastPage 已完整接入后端，但缺少播客历史列表视图和批量操作。当前页面以"创建新播客"为主，已完成的播客列表不够突出。

#### 2.7.2 增强布局线框图

```
┌─────────────────────────────────────────────────────────────┐
│ 播客工坊                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Tab Bar ─────────────────────────────────────────────┐  │
│ │ [创建播客]  [我的播客]                                 │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ ── 创建播客 Tab（现有功能）──                              │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 选择文档: [机器学习基础 ▼]                            │   │
│ │                                                      │   │
│ │ 风格: ○访谈 ○深挖 ●讲授 ○闲聊 ○冲刺                │   │
│ │ 时长: ○短 ○中 ●长 ○超长                             │   │
│ │ 语言: [中文 ▼]  TTS: [自动 ▼]  格式: [MP3 ▼]        │   │
│ │                                                      │   │
│ │ [生成播客]                                           │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ ── 我的播客 Tab（新增）──                                  │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 筛选: [全部状态 ▼] [按文档 ▼]     搜索: ________    │   │
│ ├──────────────────────────────────────────────────────┤   │
│ │                                                      │   │
│ │ ┌────────────────────────────────────────────────┐  │   │
│ │ │ 🎙️ 机器学习基础 - 访谈风格                      │  │   │
│ │ │    状态: ✅ 已完成  时长: 12:34                  │  │   │
│ │ │    创建于: 2024-01-15                           │  │   │
│ │ │    [▶ 播放] [下载] [重新生成] [删除]            │  │   │
│ │ └────────────────────────────────────────────────┘  │   │
│ │                                                      │   │
│ │ ┌────────────────────────────────────────────────┐  │   │
│ │ │ 🎙️ 深度学习笔记 - 深挖风格                      │  │   │
│ │ │    状态: ⏳ 生成语音 (67%)                       │  │   │
│ │ │    创建于: 2024-01-16                           │  │   │
│ │ │    [取消]                                       │  │   │
│ │ └────────────────────────────────────────────────┘  │   │
│ │                                                      │   │
│ │ ┌────────────────────────────────────────────────┐  │   │
│ │ │ 🎙️ 算法导论 - 讲授风格                          │  │   │
│ │ │    状态: ❌ 失败 - TTS 服务不可用                │  │   │
│ │ │    创建于: 2024-01-14                           │  │   │
│ │ │    [重试] [删除]                                 │  │   │
│ │ └────────────────────────────────────────────────┘  │   │
│ │                                                      │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 2.7.3 新增组件树

```
PodcastPage（增强）
├── TabBar                      ← 新增：创建播客 / 我的播客 切换
│
├── 创建播客 Tab
│   └── （现有组件保持不变）
│
└── 我的播客 Tab                ← 新增
    ├── PodcastHistoryFilters   ← 新增：状态/文档筛选 + 搜索
    ├── PodcastHistoryList      ← 新增：播客历史列表
    │   └── PodcastHistoryItem  ← 新增：单条播客记录（含播放/下载/重试/删除）
    └── PodcastPlayerModal      ← 已有，复用
```

#### 2.7.4 数据绑定

| 组件 | 数据项 | 来源 | 所需后端命令 |
|------|--------|------|-------------|
| PodcastHistoryList | 播客列表 | `usePodcastEpisodesQuery()` | 已有 |
| PodcastHistoryItem | 单条播客详情 | `usePodcastEpisodeQuery()` | 已有 |
| PodcastHistoryItem | 音频段 | `usePodcastAudioSegmentsQuery()` | 已有 |

**注**：播客历史的数据查询已存在，主要是前端 Tab 视图和列表 UI 的新增。

---

### 2.8 我的（ProfilePage）

#### 2.8.1 概述

当前 ProfilePage 使用 `useAppStore`（Zustand mock 数据），需完全重写，接入真实后端数据。定位为**个人学习统计中心**，展示学习热力图、掌握进度、积分明细、连续天数等。

#### 2.8.2 布局线框图

```
┌─────────────────────────────────────────────────────────────┐
│ 我的                                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │  ┌──────┐  学习者                                     │   │
│ │  │  笺  │  已学习 42 天 · 连续 7 天                    │   │
│ │  └──────┘  总积分: 380                                 │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 学习概览                                              │   │
│ │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │   │
│ │  │ 156  │ │  12  │ │ 42h  │ │  7   │               │   │
│ │  │总卡片│ │文档数│ │学习  │ │连续  │               │   │
│ │  │      │ │      │ │小时  │ │天数  │               │   │
│ │  └──────┘ └──────┘ └──────┘ └──────┘               │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 掌握进度                                              │   │
│ │  ████████████░░░░░░░░░  58%                          │   │
│ │  ┌──────┐┌──────┐┌──────┐┌──────┐                   │   │
│ │  │  23  ││  45  ││  52  ││  36  │                   │   │
│ │  │新卡片││学习中││ 复习 ││已掌握│                   │   │
│ │  └──────┘└──────┘└──────┘└──────┘                   │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 学习热力图                                            │   │
│ │  最近 16 周 · 38 活跃日 · 412 次复习                 │   │
│ │  ┌────────────────────────────────────────────────┐  │   │
│ │  │  ▓▓░░▓▓▓░▓░░▓▓▓▓░░▓▓▓░░▓▓░▓▓▓▓░░▓░▓▓▓░░  │  │   │
│ │  │  ░▓▓░░▓░▓▓▓░░▓▓░▓▓░░▓▓▓░▓░░▓▓▓░░▓░▓▓░▓▓  │  │   │
│ │  └────────────────────────────────────────────────┘  │   │
│ │  少 ░ ▒ ▓ █ 多                                       │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 积分明细                                              │   │
│ │  ┌────────────────────────────────────────────────┐  │   │
│ │  │ 2024-01-16  复习奖励  good  +10               │  │   │
│ │  │ 2024-01-16  每日首复习  --   +10              │  │   │
│ │  │ 2024-01-15  复习奖励  easy  +10               │  │   │
│ │  │ 2024-01-15  复习奖励  again +10               │  │   │
│ │  │ ...                                           │  │   │
│ │  └────────────────────────────────────────────────┘  │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ 快捷入口                                              │   │
│ │  ┌──────────┐  ┌──────────┐                          │   │
│ │  │ ⚙️ 设置  │  │ 🃏 导出  │                          │   │
│ │  │ 配置偏好  │  │ Anki 格式│                          │   │
│ │  └──────────┘  └──────────┘                          │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 2.8.3 组件树

```
ProfilePage（重写）
├── ProfileHeader                ← 新增：用户信息卡
├── ProfileStatsOverview         ← 新增：4 格统计概览
│   └── MetricCard               ← 复用 StudyTotalsCard 的 Metric 子组件模式
├── ProfileMasteryProgress       ← 新增：掌握进度条 + 4 格状态分布
│   └── SketchProgress           ← 已有
├── ProfileHeatmapSection        ← 新增：热力图区域
│   └── HeatmapCalendar          ← 已有
├── ProfilePointsLedger          ← 新增：积分明细列表
│   └── PointsLedgerRow          ← 新增：单条积分记录
└── ProfileQuickLinks            ← 新增：快捷入口
```

#### 2.8.4 数据绑定

| 组件 | 数据项 | 当前来源 | 目标来源 | 所需后端命令 |
|------|--------|----------|----------|-------------|
| ProfileHeader | totalStudyDays, streakDays | mock | `useStudyStatsQuery()` | **`get_study_stats`（新增）** |
| ProfileHeader | totalPoints | mock | `usePointsSummaryQuery()` | `get_points_summary`（已有） |
| ProfileStatsOverview | totalCards, documentsCount, totalHours, streakDays | mock | 组合查询 | 组合已有+新增 |
| ProfileMasteryProgress | masteryRate, newCount, learningCount, reviewCount, masteredCount | mock | `useMasteryBreakdownQuery()` | **`get_mastery_breakdown`（新增）** |
| ProfileHeatmapSection | entries | mock | `useReviewHeatmapQuery()` | **`get_review_heatmap`（新增）** |
| ProfilePointsLedger | points entries | mock | `usePointsLedgerQuery()` | `list_points_ledger`（已有） |

---

### 2.9 设置页（SettingsPage）

#### 2.9.1 概述

当前设置页混合了 AI 模型配置、学习偏好、播客参数三类设置，使用长滚动布局。重构为左侧子导航 + 右侧内容区的分区布局。

#### 2.9.2 布局线框图

```
┌─────────────────────────────────────────────────────────────┐
│ 设置                                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌────────────┐ ┌──────────────────────────────────────────┐│
│ │ 子导航     │ │ 内容区                                    ││
│ │            │ │                                          ││
│ │ ● AI 模型  │ │  AI 模型配置                              ││
│ │   学习偏好 │ │  ──────────────────                       ││
│ │   播客语音 │ │                                          ││
│ │   通用     │ │  ┌──────────────────────────────────┐   ││
│ │            │ │  │ 供应商配置 (BYOK)                  │   ││
│ │            │ │  │ ┌───────┐ ┌───────┐ ┌───────┐   │   ││
│ │            │ │  │ │OpenAI │ │Anthrop│ │Google │   │   ││
│ │            │ │  │ │✅已配 │ │✅已配 │ │⚠️未配 │   │   ││
│ │            │ │  │ └───────┘ └───────┘ └───────┘   │   ││
│ │            │ │  │ ┌───────┐ ┌───────────────┐     │   ││
│ │            │ │  │ │DeepSeek│ │自定义(OpenAI) │[+]  │   ││
│ │            │ │  │ │✅已配  │ │⚠️未配        │     │   ││
│ │            │ │  │ └───────┘ └───────────────┘     │   ││
│ │            │ │  └──────────────────────────────────┘   ││
│ │            │ │                                          ││
│ │            │ │  ┌──────────────────────────────────┐   ││
│ │            │ │  │ 工作流模型分配                      │   ││
│ │            │ │  │ 🃏卡片生成  OpenAI·GPT-4o   [更换]│   ││
│ │            │ │  │ 📄文档嵌入  Anthropic·Haiku [更换]│   ││
│ │            │ │  │ ❓知识问答  OpenAI·GPT-4o Mini[更换]│  ││
│ │            │ │  │ 🎙️播客生成 DeepSeek·V3    [更换]│   ││
│ │            │ │  │ 🕸️知识图谱 Anthropic·Sonnet[更换]│   ││
│ │            │ │  │ ⚡快速设置: 全部使用 [GPT-4o▼][应用]│  ││
│ │            │ │  └──────────────────────────────────┘   ││
│ │            │ │                                          ││
│ └────────────┘ └──────────────────────────────────────────┘│
│                                                             │
│ ── 学习偏好 子页 ──                                         │
│                                                             │
│ ┌────────────┐ ┌──────────────────────────────────────────┐│
│ │ 子导航     │ │ 每日新卡片数量                            ││
│ │            │ │ [10] [20] [30] [50]                       ││
│ │   AI 模型  │ │                                          ││
│ │ ● 学习偏好 │ │ 每日复习时长上限                          ││
│ │   播客语音 │ │ [15分钟] [30分钟] [45分钟] [60分钟]       ││
│ │   通用     │ │                                          ││
│ │            │ │ [保存学习设置]                             ││
│ └────────────┘ └──────────────────────────────────────────┘│
│                                                             │
│ ── 播客与语音 子页 ──                                       │
│                                                             │
│ ┌────────────┐ ┌──────────────────────────────────────────┐│
│ │ 子导航     │ │ 默认 TTS 提供商                           ││
│ │            │ │ [自动 ▼]                                  ││
│ │   AI 模型  │ │ OpenAI TTS 模型: [tts-1]                 ││
│ │   学习偏好 │ │ Fish Audio Endpoint: [________]          ││
│ │ ● 播客语音 │ │ 默认输出格式: [MP3 ▼]                    ││
│ │   通用     │ │ ☑ 跳过人工审阅                            ││
│ │            │ │ Voice Overrides JSON: [________]          ││
│ │            │ │ [保存播客设置]                             ││
│ └────────────┘ └──────────────────────────────────────────┘│
│                                                             │
│ ── 通用 子页 ──                                             │
│                                                             │
│ ┌────────────┐ ┌──────────────────────────────────────────┐│
│ │ 子导航     │ │ 主题: ○ 默认纸感 ● 手绘漫画 ○ 高对比    ││
│ │            │ │ 语言: [简体中文 ▼]                        ││
│ │   AI 模型  │ │ 数据管理:                                  ││
│ │   学习偏好 │ │   [导出学习数据] [清除本地缓存]           ││
│ │   播客语音 │ │ 关于:                                      ││
│ │ ● 通用     │ │   学笺 XueJian v1.0.0                    ││
│ │            │ │   智能学习，从心开始                        ││
│ └────────────┘ └──────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

#### 2.9.3 组件树

```
SettingsPage（重构）
├── SettingsSubNav              ← 新增：左侧子导航
│   ├── SubNavItem (AI 模型)    ← 新增
│   ├── SubNavItem (学习偏好)   ← 新增
│   ├── SubNavItem (播客与语音) ← 新增
│   └── SubNavItem (通用)       ← 新增
│
├── SettingsAiModelSection      ← 新增/改造：BYOK 供应商配置 + 工作流分配
│   ├── ProviderConfigGrid      ← BYOK 文档定义
│   └── WorkflowAssignmentPanel ← BYOK 文档定义
│
├── SettingsLearningSection     ← 新增/改造：学习偏好
│   ├── DailyNewCardLimitSelect ← 改造自现有
│   └── ReviewTimeLimitSelect   ← 改造自现有
│
├── SettingsPodcastSection      ← 新增/改造：播客与语音
│   ├── TtsProviderSelect       ← 改造自现有
│   ├── OpenaiModelInput        ← 改造自现有
│   ├── FishAudioEndpointInput  ← 改造自现有
│   ├── OutputFormatSelect      ← 改造自现有
│   ├── SkipReviewCheckbox      ← 改造自现有
│   └── VoiceOverridesTextarea  ← 改造自现有
│
└── SettingsGeneralSection      ← 新增：通用设置
    ├── ThemeSelector            ← 新增
    ├── LanguageSelector         ← 新增（预留）
    ├── DataManagementPanel      ← 新增
    └── AboutSection             ← 新增
```

#### 2.9.4 数据绑定

| 子页 | 数据项 | 来源 | 所需后端命令 |
|------|--------|------|-------------|
| AI 模型 | apiConfigs, workflowAssignments | BYOK 系统 | BYOK 文档定义的命令 |
| 学习偏好 | dailyNewCardLimit, reviewTimeLimit | `useAppSettingsQuery()` | 已有 |
| 播客与语音 | podcastTtsProvider, etc. | `useAppSettingsQuery()` | 已有 |
| 通用 | theme | `useAppUiStore()` 或新设置 | 可能需要新增 |

#### 2.9.5 子导航交互

- 子导航宽度: `w-48`，固定在左侧
- 当前选中项: `bg-ink/5 text-ink font-medium` + 左侧 2px accent bar
- 未选中项: `text-ink-muted hover:text-ink`
- 子导航项不可禁用，始终可点击
- 移动端: 子导航变为顶部水平 Tab 栏

---

## 3. 后端数据打通

### 3.1 新增 Rust 命令

#### 3.1.1 `get_study_stats`

聚合学习统计数据，供首页和个人页使用。

```rust
// src-tauri/src/commands/cards.rs 新增

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyStatsDto {
    pub today_minutes: f64,
    pub week_minutes: f64,
    pub total_minutes: f64,
    pub streak_days: i64,
    pub total_study_days: i64,
    pub active_days_this_week: i64,
    pub total_cards_studied: i64,
    pub total_reviews: i64,
}

#[tauri::command]
pub fn get_study_stats(state: State<'_, AppState>) -> CommandResult<StudyStatsDto> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    repo.get_study_stats()
}
```

**SQL 查询逻辑**（在 `card_repo.rs` 中实现）：

```sql
-- today_minutes: 当日 review_logs 的总耗时（需记录 duration 或从 created_at 间隔推算）
-- week_minutes: 最近7天同上
-- total_minutes: 全部同上
-- streak_days: 从今天往前数，连续有 review_log 的天数
-- total_study_days: 有 review_log 的不同日期数
-- active_days_this_week: 最近7天有 review_log 的天数
-- total_cards_studied: cards 表总数
-- total_reviews: review_logs 表总数
```

**连续天数计算**：

```rust
fn calculate_streak(conn: &Connection) -> Result<i64> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT DATE(created_at) AS day
         FROM review_logs
         ORDER BY day DESC"
    )?;
    let days: Vec<String> = stmt.query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    let today = Local::now().format("%Y-%m-%d").to_string();
    let mut streak = 0i64;
    let mut expected = NaiveDate::parse_from_str(&today, "%Y-%m-%d")?;

    for day_str in &days {
        let day = NaiveDate::parse_from_str(day_str, "%Y-%m-%d")?;
        if day == expected {
            streak += 1;
            expected -= Duration::days(1);
        } else if day < expected {
            break;
        }
    }
    Ok(streak)
}
```

#### 3.1.2 `get_review_heatmap`

返回指定时间范围内的每日复习次数，供热力图使用。

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewHeatmapEntryDto {
    pub date: String,    // YYYY-MM-DD
    pub count: i64,
}

#[tauri::command]
pub fn get_review_heatmap(
    state: State<'_, AppState>,
    weeks: Option<i64>,  // 默认 16
) -> CommandResult<Vec<ReviewHeatmapEntryDto>> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    let weeks = weeks.unwrap_or(16);
    repo.get_review_heatmap(weeks)
}
```

**SQL**：

```sql
SELECT DATE(created_at) AS date, COUNT(*) AS count
FROM review_logs
WHERE DATE(created_at) >= DATE('now', ?1 || ' days')
GROUP BY DATE(created_at)
ORDER BY date
-- ?1 = format!("-{}", weeks * 7)
```

#### 3.1.3 `get_mastery_breakdown`

返回卡片按状态的分布统计。

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryBreakdownDto {
    pub total_cards: i64,
    pub new_count: i64,
    pub learning_count: i64,
    pub review_count: i64,
    pub mastered_count: i64,
    pub mastery_rate: f64,  // mastered / total * 100
}

#[tauri::command]
pub fn get_mastery_breakdown(state: State<'_, AppState>) -> CommandResult<MasteryBreakdownDto> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    repo.get_mastery_breakdown()
}
```

**SQL**：

```sql
SELECT
    COUNT(*) AS total_cards,
    SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) AS new_count,
    SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) AS learning_count,
    SUM(CASE WHEN state = 'review' THEN 1 ELSE 0 END) AS review_count,
    SUM(CASE WHEN state = 'mastered' THEN 1 ELSE 0 END) AS mastered_count
FROM cards
```

#### 3.1.4 `list_accepted_cards`

返回已接受的卡片列表，供卡片库浏览。

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAcceptedCardsDto {
    pub document_id: Option<String>,
    pub card_type: Option<String>,
    pub state: Option<String>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[tauri::command]
pub fn list_accepted_cards(
    state: State<'_, AppState>,
    data: ListAcceptedCardsDto,
) -> CommandResult<Vec<CardDto>> {
    let db = state.lock_db()?;
    let repo = CardRepository::new(&db);
    repo.list_accepted_cards(
        data.document_id.as_deref(),
        data.card_type.as_deref(),
        data.state.as_deref(),
        data.search.as_deref(),
        data.limit.unwrap_or(40),
        data.offset.unwrap_or(0),
    )
}
```

#### 3.1.5 命令注册

```rust
// src-tauri/src/lib.rs 新增注册

invoke_handler(tauri::generate_handler![
    // ... 现有命令 ...
    commands::cards::get_study_stats,
    commands::cards::get_review_heatmap,
    commands::cards::get_mastery_breakdown,
    commands::cards::list_accepted_cards,
])
```

### 3.2 TypeScript Gateway 扩展

```typescript
// src/services/gateway/cards.ts 新增

async getStudyStats(): Promise<StudyStats> {
  return invokeWithSchema('get_study_stats', studyStatsSchema)
},

async getReviewHeatmap(weeks?: number): Promise<ReviewHeatmapEntry[]> {
  return invokeWithSchema('get_review_heatmap', z.array(reviewHeatmapEntrySchema), {
    weeks: weeks ?? null,
  })
},

async getMasteryBreakdown(): Promise<MasteryBreakdown> {
  return invokeWithSchema('get_mastery_breakdown', masteryBreakdownSchema)
},

async listAcceptedCards(params: {
  documentId?: string
  cardType?: string
  state?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<Card[]> {
  return invokeWithSchema('list_accepted_cards', z.array(cardSchema), {
    data: {
      documentId: params.documentId ?? null,
      cardType: params.cardType ?? null,
      state: params.state ?? null,
      search: params.search ?? null,
      limit: params.limit ?? null,
      offset: params.offset ?? null,
    },
  })
},
```

### 3.3 Zod Schema 扩展

```typescript
// src/types/schema.ts 新增

export const studyStatsSchema = z.object({
  todayMinutes: z.number(),
  weekMinutes: z.number(),
  totalMinutes: z.number(),
  streakDays: z.number(),
  totalStudyDays: z.number(),
  activeDaysThisWeek: z.number(),
  totalCardsStudied: z.number(),
  totalReviews: z.number(),
})

export const reviewHeatmapEntrySchema = z.object({
  date: z.string(),
  count: z.number(),
})

export const masteryBreakdownSchema = z.object({
  totalCards: z.number(),
  newCount: z.number(),
  learningCount: z.number(),
  reviewCount: z.number(),
  masteredCount: z.number(),
  masteryRate: z.number(),
})
```

### 3.4 React Query Hooks 扩展

```typescript
// src/queries/learning.ts 新增

export const studyStatsQueryKeys = {
  all: ['studyStats'] as const,
  stats: () => [...studyStatsQueryKeys.all, 'stats'] as const,
  heatmap: (weeks?: number) => [...studyStatsQueryKeys.all, 'heatmap', weeks ?? 'default'] as const,
  mastery: () => [...studyStatsQueryKeys.all, 'mastery'] as const,
}

export function useStudyStatsQuery() {
  return useQuery({
    queryKey: studyStatsQueryKeys.stats(),
    queryFn: () => cardsGateway.getStudyStats(),
  })
}

export function useReviewHeatmapQuery(weeks?: number) {
  return useQuery({
    queryKey: studyStatsQueryKeys.heatmap(weeks),
    queryFn: () => cardsGateway.getReviewHeatmap(weeks),
  })
}

export function useMasteryBreakdownQuery() {
  return useQuery({
    queryKey: studyStatsQueryKeys.mastery(),
    queryFn: () => cardsGateway.getMasteryBreakdown(),
  })
}
```

```typescript
// src/queries/cards.ts 新增

export function useAcceptedCardsQuery(params: {
  documentId?: string
  cardType?: string
  state?: string
  search?: string
  limit?: number
  offset?: number
}) {
  return useQuery({
    queryKey: cardsQueryKeys.accepted(params),
    queryFn: () => cardsGateway.listAcceptedCards(params),
  })
}
```

### 3.5 Mock 数据消除计划

| 文件 | mock 依赖 | 替换方案 |
|------|-----------|----------|
| `DashboardPage.tsx` | `useAppStore`, `generateMockData` | **删除整个文件**，由 HomePage 替代 |
| `ProfilePage.tsx` | `useAppStore`（flashcards, studyRecords, documents） | 重写，使用 `useStudyStatsQuery` + `useMasteryBreakdownQuery` + `useReviewHeatmapQuery` |
| `GraphPage.tsx` | `useAppStore`（documents, flashcards, groups） | **删除整个文件**，由 KnowledgeGraphPage 替代 |
| `SettingsPage.tsx` | `useAppStore`（aiConfig, setAIConfig） | 重构，使用 `useApiConfigsQuery` + BYOK 系统 |
| `store.ts` | `LocalAiConfig`, `generateMockData`, `aiConfig` | 清理：删除 aiConfig 相关代码和 mock 生成函数 |

---

## 4. 组件库扩展

### 4.1 新增组件清单

| 组件名 | 类型 | 所属目录 | 说明 |
|--------|------|----------|------|
| `TabBar` | 通用 UI | `components/ui/` | 水平 Tab 切换栏，支持 sketch 风格 |
| `SubNavItem` | 通用 UI | `components/ui/` | 设置页左侧子导航项 |
| `ProfileHeader` | Profile | `components/profile/` | 个人页头部信息卡 |
| `ProfileStatsOverview` | Profile | `components/profile/` | 4 格统计概览 |
| `ProfileMasteryProgress` | Profile | `components/profile/` | 掌握进度条 + 状态分布 |
| `ProfileHeatmapSection` | Profile | `components/profile/` | 热力图区域 |
| `ProfilePointsLedger` | Profile | `components/profile/` | 积分明细列表 |
| `ProfileQuickLinks` | Profile | `components/profile/` | 快捷入口 |
| `PointsLedgerRow` | Profile | `components/profile/` | 单条积分记录行 |
| `CardLibraryFilters` | Cards | `components/cards/` | 卡片库筛选栏 |
| `CardLibraryGrid` | Cards | `components/cards/` | 已接受卡片网格 |
| `CardLibraryCard` | Cards | `components/cards/` | 卡片浏览卡片 |
| `PodcastHistoryFilters` | Podcast | `components/podcast/` | 播客历史筛选栏 |
| `PodcastHistoryList` | Podcast | `components/podcast/` | 播客历史列表 |
| `PodcastHistoryItem` | Podcast | `components/podcast/` | 单条播客记录 |
| `SettingsSubNav` | Settings | `components/settings/` | 设置页左侧子导航 |
| `SettingsAiModelSection` | Settings | `components/settings/` | AI 模型设置区 |
| `SettingsLearningSection` | Settings | `components/settings/` | 学习偏好设置区 |
| `SettingsPodcastSection` | Settings | `components/settings/` | 播客语音设置区 |
| `SettingsGeneralSection` | Settings | `components/settings/` | 通用设置区 |

### 4.2 TabBar 组件规格

```typescript
interface TabBarProps {
  tabs: Array<{ id: string; label: string; icon?: ReactNode }>
  activeTab: string
  onTabChange: (id: string) => void
  className?: string
}
```

**视觉规格**：
- 水平排列，底部 2px 活动指示线（`bg-ink/30`）
- 活动项：`text-ink font-medium`，底部线全宽
- 非活动项：`text-ink-muted hover:text-ink`
- 间距：`gap-6`，`px-2 py-3`
- 遵循 sketch 风格：活动指示线使用 `RoughUnderline` 组件

### 4.3 SubNavItem 组件规格

```typescript
interface SubNavItemProps {
  label: string
  icon?: ReactNode
  active: boolean
  onClick: () => void
}
```

**视觉规格**：
- 容器：`w-48` 固定宽度
- 活动项：左侧 2px `bg-ink` 竖线 + `bg-ink/5` 背景 + `text-ink font-medium`
- 非活动项：`text-ink-muted hover:text-ink hover:bg-ink/3`
- 内边距：`px-4 py-2.5`
- 圆角：`rounded-r-lg`（仅右侧圆角，贴合内容区）

### 4.4 设计令牌扩展

无需新增 CSS 变量。所有新组件使用现有令牌体系：

- 背景色：`bg-paper-base`, `bg-paper-muted`, `bg-paper-card`
- 文字色：`text-ink`, `text-ink-muted`, `text-ink-soft`
- 边框：`border-line-soft`, `border-line-soft/60`
- 圆角：`rounded-[22px]`（卡片）, `rounded-full`（按钮/徽章）
- 阴影：`shadow-paper`, `shadow-card`
- 字体：`font-display`（标题/数字）, `font-ui`（标签/小字）, `font-body`（正文）

---

## 5. 状态管理更新

### 5.1 NavItemId 扩展

```typescript
// src/store/ui.ts

export type NavItemId =
  | 'home'
  | 'library'
  | 'cards'
  | 'learning'
  | 'knowledge'
  | 'graph'
  | 'podcast'
  | 'profile'    // ← 新增
  | 'settings'
```

### 5.2 SidebarRail 更新

```typescript
// src/components/shell/SidebarRail.tsx — navItems 更新

const navItems: NavItem[] = [
  { id: 'home', label: '首页', icon: <HomeIcon /> },
  { id: 'library', label: '文档库', icon: <LibraryIcon /> },
  { id: 'cards', label: '卡片工坊', icon: <CardsIcon /> },
  { id: 'learning', label: '学习', icon: <LearningIcon /> },
  { id: 'knowledge', label: '知识问答', icon: <KnowledgeIcon /> },
  { id: 'graph', label: '知识图谱', icon: <GraphIcon /> },
  { id: 'podcast', label: '播客工坊', icon: <PodcastIcon /> },
  // 分隔线
  { id: 'profile', label: '我的', icon: <ProfileIcon /> },
  { id: 'settings', label: '设置', icon: <SettingsIcon /> },
]
```

**分隔线实现**：在 `profile` 之前插入视觉分隔线（`border-t border-line-soft/60 my-2`）。

### 5.3 App.tsx 路由更新

```typescript
// src/App.tsx — 新增 profile 和 graph 路由

if (activeNavItem === 'profile') {
  return (
    <AppShell>
      <ProfilePage />
    </AppShell>
  )
}

// graph 路由从 GraphPage 切换到 KnowledgeGraphPage
if (activeNavItem === 'graph') {
  return (
    <AppShell>
      <KnowledgeGraphPage />
    </AppShell>
  )
}
```

### 5.4 TopBar 标题更新

```typescript
// src/components/shell/TopBar.tsx — PAGE_TITLES 更新

const PAGE_TITLES: Record<NavItemId, string> = {
  home: '首页',
  library: '文档库',
  cards: '卡片工坊',
  learning: '学习',
  knowledge: '知识问答',
  graph: '知识图谱',
  podcast: '播客工坊',
  profile: '我的',     // ← 新增
  settings: '设置',
}
```

### 5.5 useAppStore 清理

需要从 `store.ts` 中移除的代码：

| 项 | 说明 |
|----|------|
| `LocalAiConfig` 接口 | BYOK 系统替代，使用 `ApiConfig` |
| `aiConfig` 状态字段 | 迁移到 `api_configs` 表 + OS 密钥链 |
| `setAIConfig` / `setAiConfig` 方法 | 迁移到 `useUpdateApiConfigMutation` |
| `generateMockData` 函数 | 不再需要 mock 数据生成 |
| `flashcards` / `groups` / `clusters` / `studyRecords` | 这些数据已从后端获取，Zustand 中的 mock 副本应删除 |

**保留的 Zustand 状态**：
- `documents`：暂时保留（文档库页面可能仍在用），后续迁移到 React Query
- `isLoading`：保留用于全局加载状态
- `currentStudySession`：保留用于学习会话管理

---

## 6. 迁移策略

### 6.1 迁移阶段

#### Phase A：基础设施（不影响现有功能）

1. 新增 Rust 命令：`get_study_stats`, `get_review_heatmap`, `get_mastery_breakdown`, `list_accepted_cards`
2. 新增 TypeScript 类型、Zod Schema、Gateway 方法
3. 新增 React Query Hooks
4. 新增 `profile` 到 NavItemId

#### Phase B：新页面开发（与旧页面并行）

1. 创建 `components/profile/` 下新组件
2. 创建 `components/settings/` 下新子组件
3. 创建 `components/ui/TabBar.tsx`
4. 创建 `components/ui/SubNavItem.tsx`
5. 重写 `ProfilePage`（新文件覆盖旧文件）
6. 重构 `SettingsPage`（添加子导航）

#### Phase C：首页替换

1. 创建新 `HomePage` 组件（整合 `components/home/` 下已有组件 + 真实数据）
2. 修改 `App.tsx`：`home` 路由从 `DashboardPage` 切换到 `HomePage`
3. 删除 `DashboardPage.tsx`

#### Phase D：旧代码清理

1. 删除 `features/graph/GraphPage.tsx` 及目录
2. 修改 `App.tsx`：`graph` 路由从 `GraphPage` 切换到 `KnowledgeGraphPage`
3. 清理 `store.ts`：删除 `aiConfig`、`generateMockData`、mock 数据接口
4. 清理 `SettingsPage` 中 `useAppStore` 的 `aiConfig` 引用

#### Phase E：增强功能

1. CardStudioPage 添加"卡片库" Tab
2. PodcastPage 添加"我的播客" Tab
3. ReviewPage 完成屏幕优化

### 6.2 兼容性保障

- Phase A-C 期间，旧页面继续工作，用户无感知
- Phase C 切换首页时，确保所有首页组件已接入真实数据
- Phase D 清理旧代码前，确认无组件引用 `useAppStore` 的 mock 数据字段
- `useAppStore` 清理采用渐进式：先标记 deprecated，再删除

### 6.3 回滚方案

每个 Phase 独立可回滚：
- Phase C 回滚：恢复 `App.tsx` 中 `DashboardPage` 引用
- Phase D 回滚：恢复 `GraphPage` 引用和 `store.ts` 代码
- Phase B 回滚：删除新组件文件即可

---

## 7. 实施路线图

### 7.1 阶段划分

```
Phase A: 后端数据打通 (2-3 天)
├── Rust: get_study_stats, get_review_heatmap, get_mastery_breakdown, list_accepted_cards
├── TypeScript: Schema + Gateway + Hooks
└── NavItemId 扩展

Phase B: 新页面开发 (4-5 天)
├── TabBar + SubNavItem 通用组件
├── ProfilePage 重写（6 个新组件）
├── SettingsPage 重构（4 个子页面组件 + 子导航）
└── HomePage 新组件整合（接入真实数据）

Phase C: 首页替换 (1 天)
├── App.tsx 路由切换
└── DashboardPage 删除

Phase D: 旧代码清理 (1-2 天)
├── GraphPage 删除 + 路由切换
├── store.ts 清理
└── 旧引用清理

Phase E: 增强功能 (3-4 天)
├── CardStudioPage 卡片库 Tab
├── PodcastPage 我的播客 Tab
├── ReviewPage 完成屏幕优化
└── KnowledgeQaPage 优化

Phase F: 测试与打磨 (2-3 天)
├── 端到端测试
├── 空状态/加载态/错误态验证
├── 响应式布局验证
└── 性能优化
```

### 7.2 依赖关系

```
Phase A ──▶ Phase B ──▶ Phase C ──▶ Phase D ──▶ Phase E ──▶ Phase F
                                              │
                                              └─ Phase E 可与 Phase D 部分并行
```

### 7.3 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 学习时长统计无 duration 字段 | `todayMinutes` 等无法精确计算 | review_logs 增加 duration 列，或从 created_at 间隔估算 |
| 大量卡片时 list_accepted_cards 性能 | 卡片库加载慢 | 分页 + 虚拟滚动；limit/offset 参数 |
| SettingsPage 重构影响 BYOK 引导流程 | 新用户无法完成首次配置 | 先实现 AI 模型子页，确保 onboarding 流程不受影响 |
| ProfilePage 重写期间旧页不可用 | 用户无法查看统计 | Phase B 期间旧 ProfilePage 保持可用，新页面完成后一次性替换 |
| store.ts 清理导致其他组件崩溃 | 运行时错误 | 全局搜索 `useAppStore` 引用，逐一迁移后再删除 |

### 7.4 后续优化方向

1. **文档库搜索/筛选**：添加搜索框和状态筛选
2. **知识问答历史持久化**：对话存储到 SQLite
3. **知识图谱缩略图**：首页嵌入轻量图谱预览
4. **主题切换 UI**：通用设置中的主题选择器
5. **数据导出**：学习数据导出为 CSV/JSON
6. **通知系统**：复习提醒、生成完成通知
7. **卡片编辑器**：卡片库中的富文本编辑
8. **播客下载管理**：下载进度、本地缓存管理

---

> **文档结束**
> 本文档为学笺前端系统扩展的完整设计规格，涵盖 8 轮访谈决策、9 个页面详细规格、4 个新增后端命令、20 个新增组件、状态管理更新、渐进式迁移策略及 6 阶段实施路线图。后续开发应严格遵循本文档，任何变更需经设计评审。
