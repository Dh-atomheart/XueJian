# 学习（复习）设计规格

> NavItemId: `learning` | 路由组件: `ReviewPage`（`features/review/`）
> 设计令牌引用: 见总览文档 §设计令牌速查

---

## 1. 页面概述

### 1.1 定位

学习页是**间隔重复复习的核心交互页面**，承载以下阶段：

1. **Intro 阶段**：展示今日待复习/新卡片数量，引导开始
2. **Review 阶段**：逐张翻转卡片，用户评分（Again/Hard/Good/Easy）
3. **Complete 阶段**：展示本次会话统计，引导返回

### 1.2 核心用户场景

| 场景 | 用户行为 | 页面响应 |
|------|----------|----------|
| 开始复习 | 点击"开始学习" | 进入 Review 阶段，展示第一张卡片 |
| 翻转卡片 | 点击卡片/按空格 | 正面 → 背面翻转动画 |
| 评分 | 点击评分按钮/按快捷键 | 提交评分 → 下一张卡片 |
| 跳过 | 点击"跳过" | 标记跳过，进入下一张 |
| 完成 | 全部复习完 | 进入 Complete 阶段 |
| 中途退出 | 点击返回 | 确认弹窗 → 保留进度 |

### 1.3 现状评估

ReviewPage 已完整接入后端（`useDueCardsQuery`、`useSubmitReviewMutation`、`useDailyStatsQuery`），交互完善。改进点集中在 Complete 阶段和键盘体验。

---

## 2. 设计令牌引用

| 元素 | 令牌/组件 | 说明 |
|------|-----------|------|
| 卡片容器 | `flip-card` / `flip-card-inner` | CSS 3D 翻转 |
| 卡片正面 | `rounded-panel bg-paper-card shadow-sticky` | 正面白底 |
| 卡片背面 | `rounded-panel bg-paper-card shadow-sticky` | 背面白底 |
| 评分按钮 | `Button variant="outline/sketch"` | Again/Hard/Good/Easy |
| 进度条 | `SketchProgress` | 会话进度 |
| 空状态 | `SketchEmptyState illustration="cards"` | 无待复习卡片 |
| 正面文字 | `font-body text-lg text-ink` | 卡片问题 |
| 背面文字 | `font-body text-base text-ink-muted` | 卡片答案 |
| 快捷键提示 | `font-latin-meta text-xs text-ink-soft` | 键盘提示 |

---

## 3. 布局线框图

### 3.1 Intro 阶段

```
┌──────────────────────────────────────────────────────────────────┐
│ 学习                                                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    ┌──────────────────────┐                      │
│                    │                      │                      │
│                    │  ┌──────────────┐    │                      │
│                    │  │RoughCircleNum│    │                      │
│                    │  │     17       │    │                      │
│                    │  └──────────────┘    │                      │
│                    │                      │                      │
│                    │  今日待复习          │                      │
│                    │  12 复习 · 5 新知识   │                      │
│                    │                      │                      │
│                    │  [开始学习]          │                      │
│                    │                      │                      │
│                    └──────────────────────┘                      │
│                                                                  │
│                    快捷键: 空格翻转 · 1234评分                    │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Review 阶段

```
┌──────────────────────────────────────────────────────────────────┐
│ 学习                                       7/17  SketchProgress │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│              ┌──────────────────────────────────┐                │
│              │                                  │                │
│              │        什么是反向传播算法？         │                │
│              │                                  │                │
│              │        (点击翻转 / 空格)           │                │
│              │                                  │                │
│              └──────────────────────────────────┘                │
│                                                                  │
│              ┌──────────────────────────────────┐                │
│              │ (翻转后背面)                      │                │
│              │                                  │                │
│              │  反向传播是一种通过链式法则...      │                │
│              │                                  │                │
│              └──────────────────────────────────┘                │
│                                                                  │
│    [Again(1)]  [Hard(2)]  [Good(3)]  [Easy(4)]                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Complete 阶段（改造后）

```
┌──────────────────────────────────────────────────────────────────┐
│ 学习                                                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    ┌──────────────────────┐                      │
│                    │  ✨ 复习完成！        │                      │
│                    │                      │                      │
│                    │  ┌────┐┌────┐┌────┐│                      │
│                    │  │ 17 ││ 14 ││ 82%││                      │
│                    │  │复习││Good││正确││                      │
│                    │  └────┘└────┘└────┘│                      │
│                    │                      │                      │
│                    │  🎉 今日积分 +30     │                      │
│                    │                      │                      │
│                    │  [回到首页]  [我的统计]│                     │
│                    │                      │                      │
│                    └──────────────────────┘                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 组件树

```
ReviewPage（改造）
├── IntroPhase                    ← 已有
│   ├── RoughCircleNumber         ← 已有，复用
│   └── Button "开始学习"         ← 已有
│
├── ReviewPhase                   ← 已有
│   ├── SketchProgress            ← 已有，复用
│   ├── FlipCard                  ← 已有（CSS flip-card）
│   │   ├── CardFront
│   │   └── CardBack
│   ├── RatingButtons             ← 已有
│   │   └── Button ×4 (Again/Hard/Good/Easy)
│   └── KeyboardHint              ← 🆕 改造：首次使用浮动提示
│
└── CompletePhase                 ← 已有，改造
    ├── SessionStats              ← 已有，改造：增加积分提示
    │   └── MetricTile ×3        ← 内部组件
    ├── PointsEarnedToast         ← 🆕 新增：积分获得提示
    ├── Button "回到首页"         ← 已有
    └── Button "我的统计"         ← 🆕 新增：跳转 profile
```

---

## 5. 组件接口规格

### 5.1 PointsEarnedToast（🆕 新增）

```typescript
interface PointsEarnedToastProps {
  points: number
  visible: boolean
  onDismiss: () => void
  className?: string
}
```

**视觉规格**：
- 容器：`rounded-card bg-highlight-yellow/20 border border-highlight-yellow/40 px-4 py-3 shadow-sticky`
- 图标：`✨` 或手绘星星 SVG
- 文字：`font-ui text-sm text-ink` "今日积分 +{points}"
- 动画：`animate-slide-in` 从底部滑入，3 秒后自动消失
- 位置：Complete 阶段统计区下方

### 5.2 CompletePhase 改造

**新增行为**：
- "我的统计" 按钮：`Button variant="ghost" size="sm" className="rounded-full"` → `setActiveNavItem('profile')`
- 积分提示：复习完成后查询 `usePointsSummaryQuery`，显示本次获得的积分增量

---

## 6. 交互状态矩阵

| 状态 | 触发条件 | 展示 |
|------|----------|------|
| **noDueCards** | `useDueCardsQuery` 返回空 | `SketchEmptyState illustration="cards"` title="今日复习已清空" |
| **loading** | 加载待复习卡片 | 居中 skeleton |
| **intro** | 有待复习卡片，未开始 | Intro 阶段 |
| **reviewing** | 复习进行中 | Review 阶段 |
| **complete** | 全部完成 | Complete 阶段 + 积分提示 |
| **error** | 提交评分失败 | 内联错误提示，可重试 |

---

## 7. 数据绑定表

| 组件 | 数据项 | Hook | Gateway | Rust 命令 | 状态 |
|------|--------|------|---------|-----------|------|
| IntroPhase | dueCards count | `useDueCardsQuery()` | `cardsGateway.listDueCards()` | `list_due_cards` | ✅ |
| IntroPhase | dailyStats | `useDailyStatsQuery()` | `cardsGateway.getDailyStats()` | `get_daily_stats` | ✅ |
| ReviewPhase | dueCards | `useDueCardsQuery()` | 同上 | 同上 | ✅ |
| ReviewPhase | submitReview | `useSubmitReviewMutation()` | 已有 | 已有 | ✅ |
| CompletePhase | pointsSummary | `usePointsSummaryQuery()` | `getPointsSummary()` | `get_points_summary` | ✅ |

---

## 8. 响应式策略

| 断点 | 卡片尺寸 | 评分按钮 |
|------|----------|----------|
| **xl+** | `max-w-2xl` | 水平排列 |
| **lg** | `max-w-xl` | 水平排列 |
| **md** | `max-w-lg` | 水平排列 |
| **sm** | `max-w-sm` | 2×2 网格 |

---

## 9. 可访问性要点

| 元素 | ARIA / 键盘 |
|------|-------------|
| 翻转卡片 | `role="button"` + `aria-label="翻转卡片"`，Space/Enter 触发 |
| 评分按钮 | `aria-label="Again - 重新学习"` 等，1/2/3/4 快捷键 |
| 进度条 | `aria-valuenow` / `aria-valuemin` / `aria-valuemax` |
| 空状态 | `role="status"` |
| 快捷键提示 | 首次使用时显示浮动提示，`aria-live="polite"` |

---

## 10. 改造要点

1. **Complete 阶段增加"我的统计"按钮**：跳转 `profile` 而非 `settings`
2. **Complete 阶段增加积分提示**：`PointsEarnedToast` 组件
3. **键盘快捷键提示**：首次进入 Review 阶段时显示浮动提示（3 秒后消失）
4. **圆角修正**：`rounded-[24px]` → `rounded-panel`
