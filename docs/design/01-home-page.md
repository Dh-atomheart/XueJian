# 首页（学习中心）设计规格

> NavItemId: `home` | 路由组件: `HomePage`（新建，替换旧 `DashboardPage`）
> 设计令牌引用: 见总览文档 `frontend-system-extension.md` §设计令牌速查

---

## 1. 页面概述

### 1.1 定位

首页是用户打开应用后的**默认着陆页**，定位为**学习中心**。核心职责：

- **一目了然**：展示今日待复习/待学习卡片数量，引导用户进入学习流程
- **学习节奏**：通过学习时长、连续天数、热力图等反馈建立学习习惯
- **快速入口**：提供通往各功能区的快捷操作
- **最近文档**：延续上次阅读/操作上下文

### 1.2 核心用户场景

| 场景 | 用户行为 | 页面响应 |
|------|----------|----------|
| 日常复习 | 打开应用 → 看到"今日待复习 N 张" | 点击"开始学习" → 切换到 ReviewPage |
| 首次使用 | 无文档无卡片 | 显示 SketchEmptyState，引导导入文档 |
| 学习回顾 | 查看本周学习时长/连续天数 | HomeStudyOverviewPanel 展示真实数据 |
| 延续阅读 | 从最近文档继续 | HomeRecentDocumentsPanel 列出最近文档 |
| 快速导航 | 进入卡片工坊/知识问答等 | HomeQuickActionsPanel 提供快捷按钮 |

### 1.3 与导航关系

- 侧边栏第一项，应用启动默认页
- 无 API 配置时：仍停留在首页，通过顶部提示、提醒卡和 Settings CTA 引导用户补齐配置
- 学习完成返回首页时：数据自动刷新（query invalidation）

---

## 2. 设计令牌引用

| 元素 | 令牌/组件 | 说明 |
|------|-----------|------|
| 页面背景 | `bg-paper-base` + `paper-texture` | AppShell 统一背景 |
| 面板容器 | `Panel variant="paperCard"` | 所有面板统一白底卡片 |
| 面板标题 | `font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft` | 英文标签 |
| 面板副标题 | `font-ui text-xl text-ink` | 中文标题 |
| 标题装饰 | `RoughUnderline` | 手绘下划线 |
| 大数字 | `font-display text-3xl tabular-nums text-ink` | 统计数字 |
| 小标签 | `font-ui text-xs text-ink-muted` | 辅助说明 |
| 描述文字 | `font-body text-sm leading-6 text-ink-muted` | 正文描述 |
| 操作按钮 | `Button variant="default"` | 主操作 |
| 次要按钮 | `Button variant="ghost" size="sm" className="rounded-full"` | 次要操作 |
| 列表项 | `rounded-card border border-line-soft/75 bg-paper-base/82` | 文档/操作卡片 |
| 空状态 | `SketchEmptyState illustration="book"` | 无数据时 |
| 加载态 | `animate-pulse bg-paper-muted` | 骨架屏 |

---

## 3. 布局线框图

### 3.1 桌面端（xl+，≥1280px）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ SidebarRail │ TopBar: 首页 | 学笺                              待复习: N  │
├─────────────┼───────────────────────────────────────────────┬───────────────┤
│             │                                               │               │
│             │ ┌─────────────────────────────────────────────┐│ HomeInsight   │
│             │ │ HomeTaskHero                                ││ Rail          │
│             │ │  ┌─────────┐                                ││               │
│             │ │  │RoughCircle│ 今日学习中心                  ││ ┌───────────┐ │
│             │ │  │ Number   │ 先收束待复习...                ││ │ Desk Note │ │
│             │ │  │   N      │ [开始学习]                     ││ │ ...       │ │
│             │ │  └─────────┘ 12 待复习 · 5 新知识  +30 积分 ││ └───────────┘ │
│             │ └─────────────────────────────────────────────┘│ ┌───────────┐ │
│             │                                               │ │Weekly Sig.│ │
│             │ ┌──────────────────────┐ ┌────────────────────┐│ │ ...       │ │
│             │ │StudyOverviewPanel    │ │HeatmapPanel        ││ └───────────┘ │
│             │ │  学习概览            │ │  学习热力图        ││ ┌───────────┐ │
│             │ │  ┌────┐┌────┐┌──┐┌─┐│ │  ┌──────────────┐ ││ │Workbench  │ │
│             │ │  │今日││本周││总││连││ │  │ ▓▓░░▓▓▓░▓░  │ ││ │State      │ │
│             │ │  │ 25 ││180││42││7 ││ │  └──────────────┘ ││ │ ...       │ │
│             │ │  │分钟││分钟││h ││天││ │                    ││ └───────────┘ │
│             │ │  └────┘└────┘└──┘└─┘│ │                    ││               │
│             │ └──────────────────────┘ └────────────────────┘│               │
│             │                                               │               │
│             │ ┌──────────────────────┐ ┌────────────────────┐│               │
│             │ │RecentDocumentsPanel  │ │QuickActionsPanel   ││               │
│             │ │  最近文档            │ │  快速开始          ││               │
│             │ │  ┌────────────────┐   │ │  ┌──────┐┌──────┐ ││               │
│             │ │  │📄 机器学习基础→│   │ │  │进入  ││文档库│ ││               │
│             │ │  │📄 深度学习笔记→│  │ │  │学习  ││      │ ││               │
│             │ │  └────────────────┘   │ │  └──────┘└──────┘ ││               │
│             │ └──────────────────────┘ └────────────────────┘│               │
└─────────────┴───────────────────────────────────────────────┴───────────────┘
```

### 3.2 平板端（lg，1024-1279px）

右侧 InsightRail 隐藏，主内容区单栏，面板 2 列 grid。

### 3.3 移动端（sm/md）

所有面板纵向堆叠，HomeTaskHero 缩小，InsightRail 完全隐藏。

---

## 4. 组件树

```
HomePage（新建）
├── HomeTaskHero              ← 已有，改造：接入 useDailyStatsQuery + usePointsSummaryQuery
│   ├── RoughCircleNumber     ← 已有，复用
│   ├── Button "开始学习"     ← 已有 Button 组件
│   └── HeroCircleMetric ×2   ← 已有，复用（待复习/新知识）
│
├── 主内容区（grid 布局）
│   ├── 左栏
│   │   ├── HomeStudyOverviewPanel   ← 已有，改造：接入 useStudyStatsQuery
│   │   │   └── StudyTotalsCard      ← 已有，复用
│   │   │       └── Metric ×4        ← 已有内部组件
│   │   │
│   │   ├── HomeHeatmapPanel         ← 已有，改造：接入 useReviewHeatmapQuery
│   │   │   └── HeatmapCalendar      ← 已有，复用
│   │   │
│   │   ├── HomeRecentDocumentsPanel ← 已有，改造：接入 useDocumentsQuery
│   │   │   └── DocumentItem ×N      ← 已有内部组件
│   │   │
│   │   └── HomeQuickActionsPanel    ← 已有，保持不变
│   │       └── ActionTile ×4        ← 已有内部组件
│   │
│   └── 右栏（xl+ only）
│       └── HomeInsightRail          ← 已有，改造：接入组合查询
│           ├── Panel "Desk Note"    ← Panel variant="stickyNote"
│           ├── Panel "Weekly Signal"← Panel variant="paperCard"
│           └── Panel "Workbench"    ← Panel variant="paperCard"
│
└── SketchEmptyState           ← 已有，复用（空状态时替代主内容区）
```

**改造标注**：
- ✅ 已有组件，无需修改
- 🔧 已有组件，需改造（接入真实数据）
- 🆕 新建组件

本页无新建组件，全部为已有组件的数据接入改造。

---

## 5. 组件接口规格

本页无新建组件。以下为已有组件的改造要点。

### 5.1 HomeTaskHero 改造

**当前状态**：接收 `totalDue`, `reviewCards`, `newCards`, `todayPoints` 作为 props，但调用方（DashboardPage）传入 mock 数据。

**改造方案**：HomePage 组件内部使用 hooks 获取数据，传入 props。

```typescript
// HomePage 中的调用方式
function HomePage() {
  const { data: dailyStats } = useDailyStatsQuery()
  const { data: pointsSummary } = usePointsSummaryQuery()

  const totalDue = (dailyStats?.newCards ?? 0) + (dailyStats?.reviewCards ?? 0)

  return (
    <HomeTaskHero
      totalDue={totalDue}
      reviewCards={dailyStats?.reviewCards ?? 0}
      newCards={dailyStats?.newCards ?? 0}
      todayPoints={pointsSummary?.todayPoints ?? 0}
      onGoLearning={() => setActiveNavItem('learning')}
    />
  )
}
```

### 5.2 HomeStudyOverviewPanel 改造

**当前状态**：接收 `todayMinutes`, `weekMinutes`, `totalMinutes`, `streakDays` 作为 props。

**改造方案**：

```typescript
const { data: studyStats } = useStudyStatsQuery()

<HomeStudyOverviewPanel
  todayMinutes={studyStats?.todayMinutes ?? null}
  weekMinutes={studyStats?.weekMinutes ?? null}
  totalMinutes={studyStats?.totalMinutes ?? null}
  streakDays={studyStats?.streakDays ?? null}
/>
```

### 5.3 HomeHeatmapPanel 改造

**当前状态**：接收 `entries: HeatmapEntry[]` 作为 props。

**改造方案**：

```typescript
const { data: heatmapEntries } = useReviewHeatmapQuery(16)

<HomeHeatmapPanel entries={heatmapEntries ?? []} />
```

### 5.4 HomeRecentDocumentsPanel 改造

**当前状态**：接收 `documents`, `isLoading`, `onViewAll`, `onOpenDocument` 作为 props。

**改造方案**：

```typescript
const { data: documents, isLoading } = useDocumentsQuery()

<HomeRecentDocumentsPanel
  documents={documents ?? []}
  isLoading={isLoading}
  onViewAll={() => setActiveNavItem('library')}
  onOpenDocument={(doc) => { /* open reader */ }}
/>
```

### 5.5 HomeInsightRail 改造

**当前状态**：部分数据硬编码，部分使用 `useAppStore`。

**改造方案**：组合多个查询。

```typescript
const { data: studyStats } = useStudyStatsQuery()
const { data: pointsSummary } = usePointsSummaryQuery()
const { data: documents } = useDocumentsQuery()
const { data: apiConfigs } = useApiConfigsQuery()

// Weekly Signal
const activeDays = studyStats?.activeDaysThisWeek ?? 0
const weekMinutes = studyStats?.weekMinutes ?? null
const streakDays = studyStats?.streakDays ?? null

// Workbench State
const recentDocsCount = documents?.length ?? 0
const hasApiConfig = (apiConfigs?.length ?? 0) > 0
const todayPoints = pointsSummary?.todayPoints ?? 0
```

---

## 6. 交互状态矩阵

### 6.1 HomeTaskHero

| 状态 | 触发条件 | 展示 |
|------|----------|------|
| **empty** | 无卡片、无文档 | `SketchEmptyState illustration="book"` title="还没有学习任务" description="导入第一份文档后，学笺会为你生成卡片。" action=`<ImportDocumentButton />` |
| **hasDue** | totalDue > 0 | 正常展示 RoughCircleNumber + "开始学习"按钮 |
| **allDone** | totalDue === 0 且有卡片 | "今日复习已经清空 ✨" 次要提示"回到文档库继续学习" |
| **loading** | useDailyStatsQuery isLoading | skeleton: `animate-pulse` 占位 |

### 6.2 HomeStudyOverviewPanel

| 状态 | 展示 |
|------|------|
| **loading** | 4 格 skeleton `animate-pulse bg-paper-muted` |
| **noData** | 全部显示 `--` |
| **partial** | 有值的显示数字，无值的显示 `--` |
| **full** | 4 格全部显示真实数据 |

### 6.3 HomeHeatmapPanel

| 状态 | 展示 |
|------|------|
| **loading** | HeatmapCalendar skeleton（灰色方块网格） |
| **noReviews** | 热力图全空，副标题显示"还没有学习记录" |
| **hasData** | 正常渲染热力图 |

### 6.4 HomeRecentDocumentsPanel

| 状态 | 展示 |
|------|------|
| **loading** | 3 行 skeleton |
| **noDocuments** | 虚线框 `SketchEmptyState illustration="book"` |
| **hasDocuments** | 文档列表，最多显示 5 条 |

### 6.5 首页整体

| 状态 | 行为 |
|------|------|
| **noApiConfig** | 首页仍可展示，但 InsightRail 的 Workbench 显示"前往设置"按钮 |
| **error** | 各面板独立显示内联错误 + 重试按钮，不阻塞其他面板 |
| **stale** | 切换回首页时自动 refetch（`refetchOnWindowFocus: true`） |

---

## 7. 数据绑定表

| 组件 | 数据项 | Hook | Gateway 方法 | Rust 命令 | 状态 |
|------|--------|------|-------------|-----------|------|
| HomeTaskHero | newCards, reviewCards, correctRate | `useDailyStatsQuery()` | `cardsGateway.getDailyStats()` | `get_daily_stats` | ✅ 已有 |
| HomeTaskHero | todayPoints | `usePointsSummaryQuery()` | `getPointsSummary()` | `get_points_summary` | ✅ 已有 |
| HomeStudyOverviewPanel | todayMinutes, weekMinutes, totalMinutes, streakDays | `useStudyStatsQuery()` | `cardsGateway.getStudyStats()` | `get_study_stats` | 🆕 新增 |
| HomeHeatmapPanel | entries (date, count)[] | `useReviewHeatmapQuery(16)` | `cardsGateway.getReviewHeatmap(16)` | `get_review_heatmap` | 🆕 新增 |
| HomeRecentDocumentsPanel | documents, isLoading | `useDocumentsQuery()` | `documentsGateway.list()` | `list_documents` | ✅ 已有 |
| HomeInsightRail | activeDays, weekMinutes, streakDays | `useStudyStatsQuery()` | 同上 | 同上 | 🆕 新增 |
| HomeInsightRail | todayPoints | `usePointsSummaryQuery()` | 同上 | 同上 | ✅ 已有 |
| HomeInsightRail | recentDocsCount, hasApiConfig | `useDocumentsQuery()` + `useApiConfigsQuery()` | 已有 | 已有 | ✅ 已有 |

---

## 8. 响应式策略

| 断点 | 布局 | 变化 |
|------|------|------|
| **xl+** (≥1280px) | 主区 + 右侧 InsightRail 双栏 | InsightRail `w-72` 固定，主区 `flex-1` |
| **lg** (1024-1279px) | 主区单栏 | InsightRail 隐藏，其核心数据合并到主区 StudyOverviewPanel |
| **md** (768-1023px) | 单栏，面板 2 列 grid | HomeTaskHero 缩小，QuickActions 2 列 |
| **sm** (<768px) | 单栏，面板 1 列 | 所有面板纵向堆叠，HomeTaskHero 最小化 |

**InsightRail 数据降级**（lg 以下隐藏时）：
- "连续天数" → 合并到 StudyOverviewPanel（已有 streakDays）
- "今日积分" → 合并到 HomeTaskHero（已有 todayPoints）
- "Desk Note" → 隐藏（非关键数据）

---

## 9. 可访问性要点

| 元素 | ARIA / 键盘 |
|------|-------------|
| "开始学习"按钮 | `aria-label="开始今日复习"`，焦点可见 |
| 文档列表项 | `role="button"` + `tabIndex={0}`，Enter/Space 触发 |
| 热力图单元格 | `aria-label` 含日期和复习次数（已有） |
| 面板标题 | `heading` level 2 |
| 空状态 | `role="status"` |
| 骨架屏 | `aria-hidden="true"` + `aria-busy="true"` on parent |

---

## 10. 与现有组件的复用关系

| 已有组件 | 复用方式 |
|----------|----------|
| `Panel` | 所有面板容器 |
| `RoughCircleNumber` | HomeTaskHero 待复习数字 |
| `RoughUnderline` | 所有面板标题下划线 |
| `StudyTotalsCard` | HomeStudyOverviewPanel 内部 |
| `HeatmapCalendar` | HomeHeatmapPanel 内部 |
| `SketchEmptyState` | 空状态展示 |
| `ImportDocumentButton` | HomeQuickActionsPanel 内部 |
| `Button` | 所有操作按钮 |
| `DocumentStatusBadge` | HomeRecentDocumentsPanel 文档状态 |

---

## 11. 迁移路径

1. **创建 `HomePage.tsx`**：在 `features/home/` 下新建，整合已有 `components/home/` 组件 + hooks
2. **修改 `App.tsx`**：`activeNavItem === 'home'` 从渲染 `DashboardPage` 切换到 `HomePage`
3. **删除 `DashboardPage.tsx`**：确认无其他引用后删除
4. **清理 `store.ts`**：删除 `generateMockData` 和 `useAppStore` 中首页相关的 mock 字段
