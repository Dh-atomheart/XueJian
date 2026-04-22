# 知识图谱设计规格

> NavItemId: `graph` | 路由组件: `KnowledgeGraphPage`（`features/knowledge/`）
> 设计令牌引用: 见总览文档 §设计令牌速查

---

## 1. 页面概述

### 1.1 定位

知识图谱是基于 graphology + sigma.js 的**交互式图谱可视化页面**，核心职责：

- **图谱构建**：从文档中提取概念和关系，构建知识图谱
- **可视化浏览**：力导向布局，节点拖拽/缩放/选择
- **节点交互**：点击节点查看详情、来源文档、关联概念
- **社区检测**：自动聚类，折叠/展开社区
- **搜索定位**：搜索节点名称，定位并高亮

### 1.2 核心用户场景

| 场景 | 用户行为 | 页面响应 |
|------|----------|----------|
| 构建图谱 | 点击"构建图谱" | 启动工作流 → 轮询状态 → 渲染图谱 |
| 浏览图谱 | 拖拽/缩放 | sigma.js 原生交互 |
| 查看节点 | 点击节点 | 右侧面板显示节点详情 + 来源 |
| 搜索节点 | 输入关键词 | 匹配节点高亮 + 定位 |
| 社区折叠 | 点击社区 | 折叠/展开社区节点 |
| 从问答跳转 | 从 KnowledgeQaPage 引用跳转 | 定位到对应节点 |

### 1.3 变更说明

- 旧 `GraphPage`（`features/graph/`，canvas + mock 数据）**删除**
- 侧边栏 `graph` 导航项指向 `KnowledgeGraphPage`
- `KnowledgeGraphPage` 已完整接入后端，无需数据改造

---

## 2. 设计令牌引用

| 元素 | 令牌/组件 | 说明 |
|------|-----------|------|
| 图谱画布 | sigma.js container | 全屏画布 |
| 节点颜色 | `highlight-yellow/green/blue/pink` | 按类型着色 |
| 边颜色 | `border-line-soft` | 关系线 |
| 侧面板 | `Panel variant="paperCard"` | 节点详情面板 |
| 搜索栏 | `rounded-full border border-line-soft bg-paper-card` | 搜索输入 |
| 构建按钮 | `Button variant="default"` | 启动构建 |
| 空状态 | `SketchEmptyState illustration="graph"` | 无图谱数据 |
| 节点标签 | `font-ui text-xs text-ink` | 节点名称 |
| 社区标签 | `font-ui text-[11px] text-ink-soft` | 社区名称 |

---

## 3. 布局线框图

### 3.1 有图谱数据时

```
┌──────────────────────────────────────────────────────────────────┐
│ 知识图谱          [🔍 搜索节点...] [构建图谱] [社区折叠]        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌────────────────────────────────────────────┐ ┌──────────────┐ │
│ │                                            │ │ 节点详情     │ │
│ │              sigma.js 画布                  │ │              │ │
│ │                                            │ │ 概念: 反向传播│ │
│ │        ○───────○───────○                   │ │ 类型: concept │ │
│ │       / \      |      / \                  │ │ 来源:        │ │
│ │      ○   ○─────○────○   ○                 │ │ · ML基础 p89 │ │
│ │       \ /      |      \ /                  │ │ · DL笔记 p12 │ │
│ │        ○───────○───────○                   │ │              │ │
│ │                                            │ │ 关联概念:    │ │
│ │                                            │ │ · 梯度下降   │ │
│ │                                            │ │ · 链式法则   │ │
│ │                                            │ │              │ │
│ │                                            │ │ [在问答中提问]│ │
│ └────────────────────────────────────────────┘ └──────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 图谱统计: 128 节点 · 256 边 · 8 社区                        │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 无图谱数据时

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│              ┌──────────────────────────────┐                    │
│              │  SketchEmptyState            │                    │
│              │  illustration="graph"        │                    │
│              │  title="还没有知识图谱"       │                    │
│              │  description="构建图谱后..."  │                    │
│              │  action=[构建图谱]            │                    │
│              └──────────────────────────────┘                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 组件树

```
KnowledgeGraphPage（保持 + 增强）
├── 顶部工具栏
│   ├── NodeSearchInput            ← 已有，改造：支持从外部跳转定位
│   ├── BuildGraphButton           ← 已有
│   └── CommunityToggle            ← 已有
│
├── 主区域（flex）
│   ├── SigmaContainer            ← 已有（graphology + sigma.js）
│   │   └── GraphRenderer         ← 已有
│   │
│   └── NodeDetailPanel           ← 已有，改造：增加"在问答中提问"链接
│       ├── NodeTitle              ← 已有
│       ├── NodeType               ← 已有
│       ├── NodeSources            ← 已有
│       ├── RelatedNodes           ← 已有
│       └── GoToQaButton           ← 🆕 新增：跳转到知识问答
│
├── GraphStatsBar                 ← 已有
│
└── SketchEmptyState             ← 已有，复用（无数据时）
```

---

## 5. 组件接口规格

### 5.1 GoToQaButton（🆕 新增）

```typescript
interface GoToQaButtonProps {
  nodeLabel: string
  className?: string
}
```

**行为**：点击后 `setActiveNavItem('knowledge')`，并预填搜索词为 `nodeLabel`。

**视觉**：`Button variant="ghost" size="sm" className="rounded-full"` + 问答图标

### 5.2 NodeSearchInput 改造

**新增**：支持从外部传入搜索词（从 KnowledgeQaPage 跳转时）

```typescript
interface NodeSearchInputProps {
  // ... 已有 props
  externalSearchTerm?: string  // 🆕 外部传入的搜索词
}
```

---

## 6. 交互状态矩阵

| 状态 | 触发条件 | 展示 |
|------|----------|------|
| **empty** | 无图谱数据 | SketchEmptyState + "构建图谱"按钮 |
| **building** | 构建工作流运行中 | 进度条 + "正在构建..." |
| **built** | 图谱数据可用 | sigma.js 渲染 |
| **nodeSelected** | 点击节点 | 右侧详情面板展开 |
| **searchResult** | 搜索匹配 | 匹配节点高亮 + 视口定位 |

---

## 7. 数据绑定表

| 组件 | 数据项 | Hook | Gateway | Rust 命令 | 状态 |
|------|--------|------|---------|-----------|------|
| 构建工作流 | startBuild | `useStartGraphBuildMutation()` | 已有 | `start_graph_build_workflow` | ✅ |
| 节点列表 | nodes | `useGraphNodesQuery()` | 已有 | `list_graph_nodes` | ✅ |
| 边列表 | edges | `useAllGraphEdgesQuery()` | 已有 | `list_all_graph_edges` | ✅ |
| 节点来源 | sources | `useNodeSourcesQuery()` | 已有 | `get_node_sources` | ✅ |
| 社区列表 | communities | `useCommunitiesQuery()` | 已有 | `list_communities` | ✅ |
| 图谱统计 | stats | `useGraphStatsQuery()` | 已有 | `get_graph_stats` | ✅ |

---

## 8. 响应式策略

| 断点 | 布局 |
|------|------|
| **xl+** | 画布 + 右侧详情面板（`w-80`） |
| **lg** | 画布 + 详情面板（`w-64`） |
| **md** | 画布全屏，详情面板为底部抽屉 |
| **sm** | 画布全屏，详情面板为 modal |

---

## 9. 可访问性要点

| 元素 | ARIA / 键盘 |
|------|-------------|
| 搜索输入 | `aria-label="搜索节点"` |
| 构建按钮 | `aria-label="构建知识图谱"` |
| 节点详情面板 | `role="complementary"` + `aria-label="节点详情"` |
| 画布 | 键盘无法直接操作 sigma.js，提供搜索作为替代入口 |

---

## 10. 改造要点

1. **删除旧 GraphPage**：`features/graph/GraphPage.tsx` 及其目录
2. **App.tsx 路由切换**：`activeNavItem === 'graph'` 从 `GraphPage` → `KnowledgeGraphPage`
3. **NodeDetailPanel 增加"在问答中提问"按钮**：跨页联动到 KnowledgeQaPage
4. **NodeSearchInput 支持外部搜索词**：从 KnowledgeQaPage 引用跳转
5. **圆角修正**：硬编码圆角 → token 引用
