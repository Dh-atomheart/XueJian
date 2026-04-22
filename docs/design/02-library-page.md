# 文档库设计规格

> NavItemId: `library` | 路由组件: `LibraryPage`（`features/documents/`）
> 设计令牌引用: 见总览文档 §设计令牌速查

---

## 1. 页面概述

### 1.1 定位

文档库是用户的**文档管理中心**，核心职责：

- **文档导入**：支持 PDF 等格式的导入与自动解析
- **文档浏览**：虚拟滚动列表 + 右侧预览面板双栏布局
- **文档操作**：阅读、生成卡片、查看解析状态
- **文档删除**：清理不需要的文档

### 1.2 核心用户场景

| 场景 | 用户行为 | 页面响应 |
|------|----------|----------|
| 导入文档 | 点击"导入文档" | 文件选择器 → 上传 → 自动解析 → 列表更新 |
| 浏览文档 | 滚动列表 | 虚拟滚动，点击选中 → 右侧预览更新 |
| 进入阅读 | 点击"进入阅读" | `openReader(docId)` → 全屏阅读器 |
| 生成卡片 | 点击"卡片工坊" | `setActiveNavItem('cards')` |
| 查看状态 | 观察文档状态徽章 | `DocumentStatusBadge` 显示解析/嵌入/就绪/错误 |

### 1.3 现状评估

LibraryPage 已完整接入后端（`useDocumentsQuery`），数据流正确。主要改进点为 UX 增强。

---

## 2. 设计令牌引用

| 元素 | 令牌/组件 | 说明 |
|------|-----------|------|
| 页面背景 | AppShell 统一 | 无额外背景 |
| 文档列表容器 | `rounded-panel border border-line-soft bg-paper-card/80` | 列表外框 |
| 文档卡片（选中） | `rounded-card border-ink/20 bg-paper-base shadow-card` | 选中态 |
| 文档卡片（未选中） | `rounded-card border-line-soft bg-paper-card/90` | 默认态 |
| 统计瓷砖 | `rounded-card border border-line-soft bg-paper-card/80` | StatTile |
| 空状态 | `SketchEmptyState illustration="book"` | 替换当前硬编码空状态 |
| 标题 | `font-ui text-xl text-ink` | 页面标题 |
| 文档名 | `font-ui text-sm text-ink` truncate | 列表项标题 |
| 元数据 | `text-xs text-ink-soft` | 文件类型/大小/页数 |
| 按钮 | `Button variant="default/outline/sketch"` | 操作按钮 |

---

## 3. 布局线框图

### 3.1 有文档时（桌面端 xl+）

```
┌──────────────────────────────────────────────────────────────────┐
│ 文档库                                    12 份文档  [导入文档] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌─────────────────────────┐  ┌──────────────────────────────────┐│
│ │ ┌──────┐┌──────┐┌────┐│  │ 文档详情                         ││
│ │ │ 12   ││  8   ││  1 ││  │                    [卡片工坊]     ││
│ │ │文档数││已就绪││异常 ││  │                    [进入阅读]     ││
│ │ └──────┘└──────┘└────┘│  │                                  ││
│ │                        │  │ ┌──────────────────────────────┐ ││
│ │ ┌────────────────────┐│  │ │ DocumentPreviewPane          │ ││
│ │ │ 📄 机器学习基础  ✅││  │ │                              │ ││
│ │ │   PDF · 12MB · 342页│ │  │ │  标题: 机器学习基础         │ ││
│ │ ├────────────────────┤│  │ │  状态: ✅ 已就绪             │ ││
│ │ │ 📄 深度学习笔记  ✅││  │ │  页数: 342                   │ ││
│ │ │   PDF · 8MB · 156页 │ │  │ │  锚点: 128 个               │ ││
│ │ ├────────────────────┤│  │ │  卡片: 56 张                 │ ││
│ │ │ 📄 算法导论     ⏳││  │ │                              │ ││
│ │ │   PDF · 15MB · 892页│ │  │ └──────────────────────────────┘ ││
│ │ └────────────────────┘│  │                                  ││
│ │  (虚拟滚动)           │  │                                  ││
│ └─────────────────────────┘  └──────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 增强后的布局（新增搜索/筛选栏）

```
┌──────────────────────────────────────────────────────────────────┐
│ 文档库                                    12 份文档  [导入文档] │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 🔍 搜索文档标题...   [全部状态 ▼] [按时间排序 ▼]           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────┐  ┌──────────────────────────────────┐│
│ │ (文档列表同上)          │  │ (预览面板同上)                   ││
│ └─────────────────────────┘  └──────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 组件树

```
LibraryPage（增强）
├── 顶部栏
│   ├── 标题 + 文档计数         ← 已有
│   └── ImportDocumentButton    ← 已有，复用
│
├── LibrarySearchBar            ← 🆕 新增：搜索/筛选栏
│   ├── SearchInput             ← 🆕 新增：标题搜索输入框
│   ├── StatusFilterSelect      ← 🆕 新增：状态筛选下拉
│   └── SortSelect              ← 🆕 新增：排序方式下拉
│
├── 双栏 grid
│   ├── 左栏
│   │   └── DocumentList        ← 已有，改造：接收筛选后的文档列表
│   │       ├── StatTile ×3     ← 已有内部组件
│   │       └── VirtualList     ← 已有内部组件（@tanstack/react-virtual）
│   │           └── DocumentRow ← 已有内部组件
│   │               └── DocumentStatusBadge ← 已有，复用
│   │
│   └── 右栏
│       ├── 操作按钮组           ← 已有
│       └── DocumentPreviewPane ← 已有，复用
│
└── 空状态
    └── SketchEmptyState        ← 🆕 替换当前硬编码空状态
```

---

## 5. 组件接口规格

### 5.1 LibrarySearchBar（🆕 新增）

```typescript
interface LibrarySearchBarProps {
  /** 搜索关键词 */
  searchQuery: string
  onSearchChange: (query: string) => void
  /** 状态筛选值 */
  statusFilter: DocumentStatus | 'all'
  onStatusFilterChange: (status: DocumentStatus | 'all') => void
  /** 排序方式 */
  sortBy: 'updatedAt' | 'title' | 'pageCount'
  onSortChange: (sortBy: 'updatedAt' | 'title' | 'pageCount') => void
  className?: string
}
```

**视觉规格**：
- 容器：`Panel variant="panel" className="rounded-card"`，内边距 `px-4 py-3`
- 搜索输入：`rounded-full border border-line-soft bg-paper-card px-4 py-2 font-body text-sm text-ink placeholder:text-ink-soft`
- 筛选/排序下拉：`Button variant="ghost" size="sm" className="rounded-full"` + 下拉菜单
- 布局：`flex items-center gap-3`，搜索框 `flex-1`

**交互**：
- 搜索：debounce 300ms 后触发列表过滤
- 筛选：即时生效
- 排序：即时生效

### 5.2 DocumentList 改造

**新增 props**：

```typescript
interface DocumentListProps {
  documents: Document[]           // ← 已有
  selectedDocumentId: string | null  // ← 已有
  onSelect: (document: Document) => void  // ← 已有
  // 以下为新增
  searchQuery?: string            // 搜索过滤（前端过滤）
  statusFilter?: DocumentStatus | 'all'  // 状态过滤
  sortBy?: 'updatedAt' | 'title' | 'pageCount'  // 排序
}
```

**过滤/排序逻辑**：在组件内部 `useMemo` 实现，不增加后端查询负担。

---

## 6. 交互状态矩阵

| 状态 | 触发条件 | 展示 |
|------|----------|------|
| **empty** | 无文档 | `SketchEmptyState illustration="book"` title="文档库是空的" action=`<ImportDocumentButton />` |
| **loading** | `useDocumentsQuery` isLoading | Panel 内 "正在读取文档列表…" |
| **filterEmpty** | 有文档但筛选结果为空 | "没有匹配的文档。试试调整筛选条件。" |
| **hasDocuments** | 正常 | 双栏布局 |
| **error** | 查询失败 | 内联错误 + 重试按钮 |

---

## 7. 数据绑定表

| 组件 | 数据项 | Hook | Gateway | Rust 命令 | 状态 |
|------|--------|------|---------|-----------|------|
| LibraryPage | documents | `useDocumentsQuery()` | `documentsGateway.list()` | `list_documents` | ✅ 已有 |
| DocumentPreviewPane | 单文档详情 | props 传入 | — | — | ✅ 已有 |
| ImportDocumentButton | 导入触发 | mutation | `documentsGateway.import()` | `pick_and_import_document` | ✅ 已有 |

**注**：搜索/筛选/排序为纯前端操作，不需要新增后端命令。

---

## 8. 响应式策略

| 断点 | 布局 |
|------|------|
| **xl+** | 双栏：列表 1.1fr + 预览 0.9fr |
| **lg** | 双栏但预览区收窄 |
| **md** | 单栏，预览面板折叠为底部抽屉 |
| **sm** | 单栏，预览面板隐藏，点击文档直接进入阅读器 |

---

## 9. 可访问性要点

| 元素 | ARIA / 键盘 |
|------|-------------|
| 文档列表 | `role="listbox"`，每项 `role="option"` |
| 搜索输入 | `aria-label="搜索文档"` |
| 筛选下拉 | `aria-label="按状态筛选"` |
| 文档操作按钮 | `aria-label="进入阅读"` / `aria-label="打开卡片工坊"` |
| 虚拟列表 | 确保焦点可见，Tab 键可遍历 |

---

## 10. 与现有组件的复用关系

| 已有组件 | 复用方式 |
|----------|----------|
| `DocumentList` | 改造：增加搜索/筛选 props |
| `DocumentPreviewPane` | 直接复用 |
| `DocumentStatusBadge` | 直接复用 |
| `ImportDocumentButton` | 直接复用 |
| `Panel` | 搜索栏容器 |
| `Button` | 筛选/排序下拉触发器 |
| `SketchEmptyState` | 替换硬编码空状态 |

---

## 11. 改造要点

1. **替换空状态**：将 `LibraryPage` 中的硬编码空状态（`📄` emoji + 文字）替换为 `SketchEmptyState illustration="book"`
2. **新增搜索栏**：在文档列表上方添加 `LibrarySearchBar`
3. **DocumentList 改造**：增加 `searchQuery`/`statusFilter`/`sortBy` props，内部 `useMemo` 过滤排序
4. **圆角修正**：`rounded-[24px]` → `rounded-panel`，`rounded-[22px]` → `rounded-card`，`rounded-[28px]` → `rounded-panel`
