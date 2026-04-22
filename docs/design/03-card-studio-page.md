# 卡片工坊设计规格

> NavItemId: `cards` | 路由组件: `CardStudioPage`（`features/cards/`）
> 设计令牌引用: 见总览文档 §设计令牌速查

---

## 1. 页面概述

### 1.1 定位

卡片工坊是**卡片生产与管理中心**，双 Tab 布局：

- **生成工坊** Tab：从文档生成候选卡，审阅并接受/拒绝
- **卡片库** Tab（🆕）：浏览已接受卡片，搜索/筛选/编辑/批量操作

### 1.2 核心用户场景

| 场景 | 用户行为 | 页面响应 |
|------|----------|----------|
| 生成卡片 | 选择文档 → 启动工作流 | 轮询状态 → 候选卡出现 |
| 审阅候选卡 | 逐张查看 → 接受/拒绝 | 状态更新，计数变化 |
| 浏览卡片库 | 切换到"卡片库" Tab | 加载已接受卡片列表 |
| 筛选卡片 | 按文档/状态/类型筛选 | 前端过滤或后端分页查询 |
| 编辑卡片 | 点击"编辑" | 内联编辑 front/back |
| 批量操作 | 多选 → 批量删除/导出 | 确认弹窗 → 执行 |

---

## 2. 设计令牌引用

| 元素 | 令牌/组件 | 说明 |
|------|-----------|------|
| Tab 栏 | `TabBar` 🆕 | 水平 Tab 切换 |
| 面板容器 | `Panel variant="paperCard"` | 各区域容器 |
| 候选卡卡片 | `rounded-card border bg-paper-base/82` | 候选卡展示 |
| 卡片库卡片 | `rounded-card border border-line-soft bg-paper-card` | 卡片库浏览 |
| 状态徽章 | `rounded-full text-xs font-ui` | 接受/拒绝/待定 |
| 空状态 | `SketchEmptyState illustration="cards"` | 无候选卡/无卡片 |
| 工作流状态 | `font-ui text-xs text-ink-soft` | 运行中/完成/失败 |
| 大数字 | `font-display tabular-nums text-ink` | 计数统计 |

---

## 3. 布局线框图

### 3.1 生成工坊 Tab（现有功能保持）

```
┌──────────────────────────────────────────────────────────────────┐
│ 卡片工坊                                                         │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ TabBar ────────────────────────────────────────────────────┐ │
│ │ [● 生成工坊]  [卡片库]                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────┐  ┌──────────────────────────────────────┐│
│ │ 文档选择 & 工作流    │  │ 候选卡列表                          ││
│ │                     │  │                                      ││
│ │ 📄 选择文档 ▼       │  │ ┌──────┐ ┌──────┐ ┌──────┐         ││
│ │ 运行 #3 [查看]      │  │ │ ✅   │ │ ⏳   │ │ ❌   │         ││
│ │ 限制: 24 张         │  │ │卡 1  │ │卡 2  │ │卡 3  │         ││
│ │                     │  │ │Q:... │ │Q:... │ │Q:... │         ││
│ │ [启动生成]          │  │ │A:... │ │A:... │ │A:... │         ││
│ │                     │  │ └──────┘ └──────┘ └──────┘         ││
│ │ 工作流状态:         │  │                                      ││
│ │ ● 运行中 (67%)      │  │ 接受: 12  拒绝: 3  待定: 9          ││
│ └─────────────────────┘  └──────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 卡片库 Tab（🆕 新增）

```
┌──────────────────────────────────────────────────────────────────┐
│ ┌─ TabBar ────────────────────────────────────────────────────┐ │
│ │ [生成工坊]  [● 卡片库]                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 🔍 搜索卡片...  [全部状态 ▼] [按文档 ▼] [按类型 ▼]  共156张│ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐       │
│ │ Q: 什么是反向传播│ │ Q: 梯度消失的  │ │ Q: CNN 的池化  │       │
│ │ A: 反向传播是一 │ │   原因是什么？ │ │   层的作用？   │       │
│ │ ...            │ │ A: 梯度消失是  │ │ A: 池化层用于  │       │
│ │                │ │ ...           │ │ ...           │       │
│ │ 状态: learning │ │ 状态: review  │ │ 状态: new     │       │
│ │ 来源: ML基础 p12│ │ 来源: DL笔记  │ │ 来源: ML基础  │       │
│ │ [编辑] [删除]  │ │ [编辑] [删除] │ │ [编辑] [删除] │       │
│ └────────────────┘ └────────────────┘ └────────────────┘       │
│                                                                  │
│ ┌────────────────┐ ┌────────────────┐                           │
│ │ ...            │ │ ...            │                           │
│ └────────────────┘ └────────────────┘                           │
│                                                                  │
│ 已加载 40/156 张 · [加载更多]                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 组件树

```
CardStudioPage（增强）
├── TabBar                          ← 🆕 新增
│   ├── TabItem "生成工坊"
│   └── TabItem "卡片库"
│
├── 生成工坊 Tab
│   └── （现有组件保持不变）
│       ├── 文档选择区
│       ├── 工作流控制区
│       └── 候选卡列表区
│
└── 卡片库 Tab                      ← 🆕 新增
    ├── CardLibraryToolbar          ← 🆕 新增：搜索/筛选/统计
    │   ├── SearchInput
    │   ├── StateFilterSelect
    │   ├── DocumentFilterSelect
    │   ├── TypeFilterSelect
    │   └── CardCountLabel
    │
    ├── CardLibraryGrid             ← 🆕 新增：卡片网格
    │   └── CardLibraryCard ×N     ← 🆕 新增：单张卡片浏览卡
    │       ├── CardFrontBack       ← 🆕 新增：正面/背面展示
    │       ├── CardMetaRow         ← 🆕 新增：状态/来源/页码
    │       └── CardActions         ← 🆕 新增：编辑/删除按钮
    │
    ├── CardLibraryPagination       ← 🆕 新增：分页/加载更多
    │
    └── SketchEmptyState           ← 已有，复用（无卡片时）
```

---

## 5. 组件接口规格

### 5.1 TabBar（🆕 新增，通用组件）

```typescript
interface TabBarProps {
  tabs: Array<{ id: string; label: string; icon?: ReactNode }>
  activeTab: string
  onTabChange: (id: string) => void
  className?: string
}
```

**视觉规格**：
- 容器：`flex gap-6 border-b border-line-soft/60 px-2`
- 活动项：`text-ink font-ui font-medium` + 底部 `RoughUnderline` 指示
- 非活动项：`text-ink-muted font-ui hover:text-ink`
- 内边距：`px-2 py-3`
- 动画：切换时 `transition-colors duration-200`

### 5.2 CardLibraryToolbar（🆕 新增）

```typescript
interface CardLibraryToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  stateFilter: CardState | 'all'
  onStateFilterChange: (state: CardState | 'all') => void
  documentFilter: string | 'all'
  onDocumentFilterChange: (docId: string | 'all') => void
  typeFilter: string | 'all'
  onTypeFilterChange: (type: string | 'all') => void
  totalCount: number
  className?: string
}

type CardState = 'new' | 'learning' | 'review' | 'relearning' | 'mastered'
```

**视觉规格**：
- 容器：`Panel variant="panel" className="rounded-card"`
- 布局：`flex items-center gap-3 flex-wrap`
- 搜索框：`rounded-full border border-line-soft bg-paper-card px-4 py-2 font-body text-sm`
- 下拉：`Button variant="ghost" size="sm" className="rounded-full"` + popover
- 计数：`font-ui text-xs text-ink-soft`

### 5.3 CardLibraryCard（🆕 新增）

```typescript
interface CardLibraryCardProps {
  card: Card
  onEdit: (card: Card) => void
  onDelete: (cardId: string) => void
  className?: string
}
```

**视觉规格**：
- 容器：`rounded-card border border-line-soft bg-paper-card p-4 shadow-card hover:shadow-sticky transition-shadow`
- 正面（Q）：`font-body text-sm text-ink`，最多 3 行 `line-clamp-3`
- 背面（A）：`font-body text-sm text-ink-muted`，最多 3 行
- 状态徽章：`rounded-full px-2 py-0.5 font-ui text-[10px]`
  - `new`: `bg-highlight-blue/30 text-ink`
  - `learning`: `bg-highlight-yellow/30 text-ink`
  - `review`: `bg-highlight-green/30 text-ink`
  - `mastered`: `bg-highlight-green/60 text-ink`
- 来源行：`font-ui text-[11px] text-ink-soft`（文档名 + 页码）
- 操作按钮：`Button variant="ghost" size="sm"`，hover 时显示

### 5.4 CardLibraryGrid（🆕 新增）

```typescript
interface CardLibraryGridProps {
  cards: Card[]
  onEdit: (card: Card) => void
  onDelete: (cardId: string) => void
  isLoading: boolean
  className?: string
}
```

**视觉规格**：
- 布局：`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`
- 加载态：6 格 skeleton
- 空态：`SketchEmptyState illustration="cards"`

---

## 6. 交互状态矩阵

### 6.1 生成工坊 Tab

| 状态 | 展示 |
|------|------|
| **noDocument** | 提示选择文档 |
| **workflowRunning** | 进度条 + 候选卡逐步出现 |
| **workflowComplete** | 候选卡全部展示，接受/拒绝操作 |
| **workflowError** | 错误提示 + 重试按钮 |

### 6.2 卡片库 Tab

| 状态 | 展示 |
|------|------|
| **loading** | 6 格 skeleton |
| **empty** | `SketchEmptyState illustration="cards"` title="还没有已接受的卡片" |
| **filterEmpty** | "没有匹配的卡片" |
| **hasCards** | 网格展示 |
| **deleting** | 卡片淡出动画 |

---

## 7. 数据绑定表

| 组件 | 数据项 | Hook | Gateway | Rust 命令 | 状态 |
|------|--------|------|---------|-----------|------|
| 生成工坊 | 候选卡列表 | `useCardCandidatesQuery()` | 已有 | 已有 | ✅ |
| 生成工坊 | 工作流运行 | `useWorkflowRunQuery()` | 已有 | 已有 | ✅ |
| 卡片库 | 已接受卡片 | `useAcceptedCardsQuery()` 🆕 | `cardsGateway.listAcceptedCards()` 🆕 | `list_accepted_cards` 🆕 | 🆕 |
| 卡片库 | 文档列表（筛选用） | `useDocumentsQuery()` | 已有 | 已有 | ✅ |
| CardLibraryCard | 删除卡片 | `useDeleteCardMutation()` | 已有 | `delete_card` | ✅ |
| CardLibraryCard | 编辑卡片 | `useUpdateCardMutation()` | 已有 | `update_card` | ✅ |

---

## 8. 响应式策略

| 断点 | 卡片库网格 | 生成工坊布局 |
|------|-----------|-------------|
| **xl+** | 3 列 | 双栏（左控制 + 右候选卡） |
| **lg** | 3 列 | 双栏 |
| **md** | 2 列 | 单栏纵向 |
| **sm** | 1 列 | 单栏纵向 |

---

## 9. 可访问性要点

| 元素 | ARIA / 键盘 |
|------|-------------|
| Tab 栏 | `role="tablist"`，每项 `role="tab"` + `aria-selected` |
| 卡片网格 | `role="list"`，每项 `role="listitem"` |
| 编辑/删除按钮 | `aria-label="编辑卡片"` / `aria-label="删除卡片"` |
| 删除确认 | 焦点陷阱弹窗，Escape 关闭 |

---

## 10. 与现有组件的复用关系

| 已有组件 | 复用方式 |
|----------|----------|
| `Panel` | 工具栏/区域容器 |
| `Button` | 所有操作按钮 |
| `SketchEmptyState` | 空状态 |
| `RoughUnderline` | Tab 活动指示 |
| `DocumentStatusBadge` | 候选卡状态（已有模式） |
