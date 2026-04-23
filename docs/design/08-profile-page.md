# 我的（统计）设计规格

> NavItemId: `profile` 🆕 | 路由组件: `ProfilePage`（`features/profile/`）
> 设计令牌引用: 见总览文档 §设计令牌速查

---

## 1. 页面概述

### 1.1 定位

"我的"页面是**个人学习统计中心**，完全重写，从 mock 数据迁移到真实后端数据。核心职责：

- **学习概览**：总卡片/文档/学习时长/连续天数
- **掌握进度**：卡片状态分布（新/学习/复习/已掌握）+ 掌握率
- **学习热力图**：GitHub 风格的复习频率热力图
- **积分明细**：积分获取记录列表
- **快捷入口**：设置/导出等操作
- 页面在缺少 AI/BYOK 配置时仍可进入并查看已有统计；配置缺失只影响相关 AI 动作，不影响历史数据浏览。

### 1.2 核心用户场景

| 场景 | 用户行为 | 页面响应 |
|------|----------|----------|
| 查看学习统计 | 打开"我的"页面 | 展示概览 + 热力图 + 积分 |
| 查看掌握进度 | 观察进度条 | 4 格状态分布 + 百分比 |
| 查看热力图 | 浏览热力图 | 16 周复习频率可视化 |
| 查看积分明细 | 滚动积分列表 | 按时间倒序展示 |
| 前往设置 | 点击"设置" | `setActiveNavItem('settings')` |
| 导出数据 | 点击"导出" | 触发 Anki/CSV 导出 |

### 1.3 现状评估

当前 ProfilePage 使用 `useAppStore`（Zustand mock 数据），需完全重写。所有数据从后端查询获取。

---

## 2. 设计令牌引用

| 元素 | 令牌/组件 | 说明 |
|------|-----------|------|
| 页面背景 | AppShell 统一 | 无额外背景 |
| 头部卡片 | `Panel variant="paperCard"` | 用户信息卡 |
| 统计网格 | `rounded-card border border-line-soft bg-paper-card` | 4 格统计 |
| 大数字 | `font-display text-2xl tabular-nums text-ink` | 统计数值 |
| 统计标签 | `font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft` | 标签 |
| 进度条 | `SketchProgress` | 掌握进度 |
| 状态分布 | `rounded-item bg-paper-muted px-3 py-3` | 4 格分布 |
| 热力图 | `HeatmapCalendar` | 已有组件 |
| 积分列表 | `rounded-card border border-line-soft bg-paper-card` | 积分行 |
| 空状态 | `SketchEmptyState illustration="heatmap"` | 无学习记录 |
| 快捷入口 | `rounded-card border border-line-soft bg-paper-base/82` | 入口卡片 |
| 标题装饰 | `RoughUnderline` | 手绘下划线 |

---

## 3. 布局线框图

```
┌──────────────────────────────────────────────────────────────────┐
│ 我的                                                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │  ┌──────┐  学习者                              连续 7 天 🔥│ │
│ │  │ 笺   │  已学习 42 天 · 总积分 380                         │ │
│ │  │Logo  │                                                 │ │
│ │  └──────┘                                                 │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 学习概览                          RoughUnderline            │ │
│ │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                      │ │
│ │  │  156  │ │  12  │ │ 42h  │ │  7   │                      │ │
│ │  │总卡片 │ │文档数│ │学习  │ │连续  │                      │ │
│ │  │      │ │      │ │小时  │ │天数  │                      │ │
│ │  └──────┘ └──────┘ └──────┘ └──────┘                      │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 掌握进度                          RoughUnderline            │ │
│ │  SketchProgress 58%                                        │ │
│ │  ┌──────┐┌──────┐┌──────┐┌──────┐                        │ │
│ │  │  23  ││  45  ││  52  ││  36  │                        │ │
│ │  │新卡片 ││学习中││ 复习 ││已掌握│                        │ │
│ │  └──────┘└──────┘└──────┘└──────┘                        │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 学习热力图                        RoughUnderline            │ │
│ │  最近 16 周 · 38 活跃日 · 412 次复习                       │ │
│ │  ┌──────────────────────────────────────────────────────┐   │ │
│ │  │  HeatmapCalendar                                     │   │ │
│ │  └──────────────────────────────────────────────────────┘   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 积分明细                          RoughUnderline            │ │
│ │  ┌──────────────────────────────────────────────────────┐   │ │
│ │  │ 2024-01-16  复习奖励  good  +10                      │   │ │
│ │  │ 2024-01-16  每日首复习  --   +10                     │   │ │
│ │  │ 2024-01-15  复习奖励  easy  +10                      │   │ │
│ │  │ 202习-01-15  复习奖励  again +10                     │   │ │
│ │  │ ...                                                  │   │ │
│ │  │ [加载更多]                                            │   │ │
│ │  └──────────────────────────────────────────────────────┘   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 快捷入口                                                    │ │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │ │
│ │  │ ⚙️ 设置  │  │ 📤 导出  │  │ 📊 重置  │                 │ │
│ │  │ 配置偏好  │  │ Anki 格式│  │ 学习数据  │                 │ │
│ │  └──────────┘  └──────────┘  └──────────┘                 │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 组件树

```
ProfilePage（重写）
├── ProfileHeader                  ← 🆕 新增：用户信息卡
│   ├── AppLogo                    ← 已有 Logo
│   ├── StudyDaysLabel             ← 🆕："已学习 N 天"
│   ├── StreakLabel                ← 🆕："连续 N 天 🔥"
│   └── TotalPointsLabel           ← 🆕："总积分 N"
│
├── ProfileStatsOverview           ← 🆕 新增：4 格统计概览
│   └── StatTile ×4               ← 🆕：总卡片/文档数/学习时长/连续天数
│       └── RoughCircleNumber      ← 已有，复用（可选装饰）
│
├── ProfileMasterySection          ← 🆕 新增：掌握进度
│   ├── SketchProgress             ← 已有，复用
│   └── MasteryBreakdown           ← 🆕：4 格状态分布
│       └── StateTile ×4          ← 🆕：新/学习/复习/已掌握
│
├── ProfileHeatmapSection          ← 🆕 新增：热力图区域
│   └── HeatmapCalendar            ← 已有，复用
│
├── ProfilePointsSection           ← 🆕 新增：积分明细
│   └── PointsLedgerList           ← 🆕：积分列表
│       └── PointsLedgerRow ×N    ← 🆕：单条积分记录
│
├── ProfileQuickLinks              ← 🆕 新增：快捷入口
│   └── QuickLinkTile ×3          ← 🆕：设置/导出/重置
│
└── SketchEmptyState              ← 已有，复用（首次使用无数据时）
```

---

## 5. 组件接口规格

### 5.1 ProfileHeader（🆕 新增）

```typescript
interface ProfileHeaderProps {
  totalStudyDays: number
  streakDays: number
  totalPoints: number
  className?: string
}
```

**视觉规格**：
- 容器：`Panel variant="paperCard" className="rounded-panel p-6"`
- 布局：`flex items-center gap-6`
- Logo：`h-12 w-12 rounded-card bg-paper-muted flex items-center justify-center font-display text-xl text-ink`
- 连续天数：`bg-highlight-yellow/20 rounded-full px-3 py-1 font-ui text-xs text-ink` + 🔥
- 总积分：`font-display text-lg tabular-nums text-ink`

### 5.2 StatTile（🆕 新增）

```typescript
interface StatTileProps {
  label: string
  value: string | number
  unit?: string
  className?: string
}
```

**视觉规格**：
- 容器：`rounded-card border border-line-soft bg-paper-card px-4 py-4`
- 标签：`font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft`
- 数值：`font-display text-2xl tabular-nums text-ink`
- 单位：`font-ui text-xs text-ink-muted`

### 5.3 MasteryBreakdown（🆕 新增）

```typescript
interface MasteryBreakdownProps {
  newCount: number
  learningCount: number
  reviewCount: number
  masteredCount: number
  className?: string
}
```

**视觉规格**：
- 布局：`grid grid-cols-4 gap-3`
- 每格：`rounded-item bg-paper-muted px-3 py-3`
- 颜色编码：
  - 新卡片：`border-l-2 border-l-highlight-blue`
  - 学习中：`border-l-2 border-l-highlight-yellow`
  - 复习：`border-l-2 border-l-highlight-green`
  - 已掌握：`border-l-2 border-l-highlight-green/80`

### 5.4 PointsLedgerRow（🆕 新增）

```typescript
interface PointsLedgerRowProps {
  entry: PointsEntry
  className?: string
}
```

**视觉规格**：
- 容器：`flex items-center justify-between py-2 border-b border-line-soft/40 last:border-0`
- 日期：`font-latin-meta text-xs text-ink-soft`
- 类型：`font-ui text-xs text-ink-muted`
- 评分：`rounded-full px-2 py-0.5 font-ui text-[10px]`（颜色按评分）
- 积分：`font-display text-sm tabular-nums text-highlight-green`

### 5.5 QuickLinkTile（🆕 新增）

```typescript
interface QuickLinkTileProps {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
  className?: string
}
```

**视觉规格**：
- 容器：`rounded-card border border-line-soft bg-paper-base/82 p-4 text-left hover:-translate-y-[1px] hover:bg-paper-card transition`
- 布局：同 HomeQuickActionsPanel 的 ActionTile 模式

---

## 6. 交互状态矩阵

| 状态 | 触发条件 | 展示 |
|------|----------|------|
| **empty** | 无学习记录 | `SketchEmptyState illustration="heatmap"` title="还没有学习记录" |
| **loading** | 各查询 loading | 各区域独立 skeleton |
| **partial** | 部分数据可用 | 有值的显示，无值显示 `--` |
| **full** | 全部数据可用 | 完整展示 |
| **error** | 查询失败 | 内联错误 + 重试 |

---

## 7. 数据绑定表

| 组件 | 数据项 | Hook | Gateway | Rust 命令 | 状态 |
|------|--------|------|---------|-----------|------|
| ProfileHeader | totalStudyDays, streakDays | `useStudyStatsQuery()` 🆕 | `cardsGateway.getStudyStats()` 🆕 | `get_study_stats` 🆕 | 🆕 |
| ProfileHeader | totalPoints | `usePointsSummaryQuery()` | `getPointsSummary()` | `get_points_summary` | ✅ |
| ProfileStatsOverview | totalCards, totalMinutes, streakDays | `useStudyStatsQuery()` 🆕 + `useMasteryBreakdownQuery()` 🆕 | 同上 🆕 | 同上 🆕 | 🆕 |
| ProfileStatsOverview | documentsCount | `useDocumentsQuery()` | 已有 | 已有 | ✅ |
| ProfileMasterySection | newCount, learningCount, reviewCount, masteredCount | `useMasteryBreakdownQuery()` 🆕 | `cardsGateway.getMasteryBreakdown()` 🆕 | `get_mastery_breakdown` 🆕 | 🆕 |
| ProfileHeatmapSection | entries | `useReviewHeatmapQuery(16)` 🆕 | `cardsGateway.getReviewHeatmap(16)` 🆕 | `get_review_heatmap` 🆕 | 🆕 |
| ProfilePointsSection | points entries | `usePointsLedgerQuery()` | `listPointsLedger()` | `list_points_ledger` | ✅ |

---

## 8. 响应式策略

| 断点 | 统计网格 | 掌握分布 | 热力图 |
|------|----------|----------|--------|
| **xl+** | 4 列 | 4 列 | 全宽 |
| **lg** | 4 列 | 4 列 | 全宽 |
| **md** | 2 列 | 2 列 | 全宽 |
| **sm** | 2 列 | 2 列 | 全宽，缩小 |

---

## 9. 可访问性要点

| 元素 | ARIA / 键盘 |
|------|-------------|
| 统计网格 | `role="list"` + `role="listitem"` |
| 进度条 | `aria-valuenow` / `aria-valuemin` / `aria-valuemax` |
| 热力图 | 已有（HeatmapCalendar 内置） |
| 积分列表 | `role="list"` |
| 快捷入口 | `role="button"` + `tabIndex={0}` |

---

## 10. 与现有组件的复用关系

| 已有组件 | 复用方式 |
|----------|----------|
| `Panel` | 所有区域容器 |
| `RoughUnderline` | 区域标题装饰 |
| `RoughCircleNumber` | 统计数字装饰（可选） |
| `SketchProgress` | 掌握进度条 |
| `HeatmapCalendar` | 热力图 |
| `SketchEmptyState` | 空状态 |
| `Button` | 操作按钮 |

---

## 11. 迁移路径

1. **完全重写 ProfilePage**：删除旧实现（`useAppStore` mock 数据），新文件使用 hooks
2. **新增 NavItemId `'profile'`**：在 `store/ui.ts` 中添加
3. **更新 SidebarRail**：添加 `profile` 导航项
4. **更新 App.tsx**：添加 `profile` 路由
5. **更新 TopBar**：添加 `profile` 标题
6. **删除旧 ProfilePage 中的"前往设置"按钮**：改为快捷入口区的设置链接
