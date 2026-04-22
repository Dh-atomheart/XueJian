# 设置设计规格

> NavItemId: `settings` | 路由组件: `SettingsPage`（`features/settings/`）
> 设计令牌引用: 见总览文档 §设计令牌速查

---

## 1. 页面概述

### 1.1 定位

设置页是**应用配置中心**，从单一长滚动页面重构为**左侧子导航 + 右侧内容区**的分区布局。四个子页面：

1. **AI 模型**：BYOK 供应商配置 + 工作流模型分配
2. **学习偏好**：每日新卡限制、复习时长上限
3. **播客与语音**：TTS 提供商、输出格式、语音参数
4. **通用**：主题、语言、数据管理、关于

### 1.2 核心用户场景

| 场景 | 用户行为 | 页面响应 |
|------|----------|----------|
| 首次配置 | 启动应用 → 强制跳转设置 | AI 模型子页高亮，引导配置 API Key |
| 添加供应商 | 点击"添加配置" | 配置表单 → 连接测试 → 保存 |
| 切换模型 | 修改工作流分配 | 下拉选择 → 保存 |
| 调整学习量 | 修改每日新卡限制 | 选择 → 保存 |
| 配置 TTS | 选择 TTS 提供商 | 下拉选择 → 保存 |
| 切换主题 | 选择主题 | 即时切换预览 |
| 清除缓存 | 点击"清除本地缓存" | 确认弹窗 → 执行 |

### 1.3 现状评估

当前 SettingsPage 混合了三类设置（AI 模型 + 学习偏好 + 播客参数），使用长滚动布局。重构为分区布局，AI 模型部分对接 BYOK 系统（详见 `byok-system.md`）。

---

## 2. 设计令牌引用

| 元素 | 令牌/组件 | 说明 |
|------|-----------|------|
| 左侧子导航 | `Panel variant="panel" className="rounded-none"` | 固定左侧栏 |
| 子导航项（选中） | `border-l-2 border-l-ink bg-ink/5 text-ink font-medium` | 活动态 |
| 子导航项（未选中） | `text-ink-muted hover:text-ink hover:bg-ink/3` | 默认态 |
| 内容区 | `Panel variant="paperCard" className="rounded-panel"` | 右侧内容 |
| 配置卡片 | `rounded-card border border-line-soft bg-paper-card` | 供应商卡片 |
| 表单标签 | `font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft` | 标签 |
| 表单输入 | `rounded-full border border-line-soft bg-paper-card px-4 py-2 font-body text-sm` | 输入框 |
| 选择器 | `rounded-item border border-line-soft` | 选项组 |
| 选中选项 | `border-ink/30 bg-ink/5` | 选中态 |
| 连接测试按钮 | `Button variant="outline" className="rounded-full"` | 测试 |
| 保存按钮 | `Button variant="default"` | 保存 |
| 空配置提示 | `SketchEmptyState illustration="note"` | 无 API 配置 |
| 主题预览 | `rounded-card border border-line-soft bg-paper-card` | 主题色卡 |

---

## 3. 布局线框图

### 3.1 整体布局

```
┌──────────────────────────────────────────────────────────────────┐
│ 设置                                                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌────────────┐ ┌──────────────────────────────────────────────┐  │
│ │ 子导航     │ │ 内容区                                      │  │
│ │            │ │                                              │  │
│ │ ● AI 模型  │ │  (根据选中子页显示不同内容)                   │  │
│ │   学习偏好 │ │                                              │  │
│ │   播客语音 │ │                                              │  │
│ │   通用     │ │                                              │  │
│ │            │ │                                              │  │
│ │            │ │                                              │  │
│ │            │ │                                              │  │
│ │            │ │                                              │  │
│ │            │ │                                              │  │
│ └────────────┘ └──────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 AI 模型子页

```
┌────────────┐ ┌──────────────────────────────────────────────┐
│ 子导航     │ │ AI 模型配置                                   │
│            │ │                                              │
│ ● AI 模型  │ │ 供应商配置 (BYOK)                             │
│   学习偏好 │ │ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│   播客语音 │ │ │ OpenAI  │ │Anthropic│ │ Google  │        │
│   通用     │ │ │ ✅已配  │ │ ✅已配  │ │ ⚠️未配  │        │
│            │ │ │ gpt-4o  │ │ claude  │ │         │        │
│            │ │ │ [编辑]  │ │ [编辑]  │ │ [配置]  │        │
│            │ │ └─────────┘ └─────────┘ └─────────┘        │
│            │ │ ┌─────────┐ ┌──────────────────┐             │
│            │ │ │DeepSeek │ │自定义(OpenAI兼容) │ [+]        │
│            │ │ │ ✅已配  │ │ ⚠️未配           │             │
│            │ │ │ [编辑]  │ │ [配置]           │             │
│            │ │ └─────────┘ └──────────────────┘             │
│            │ │                                              │
│            │ │ 工作流模型分配                                │
│            │ │ ┌──────────────────────────────────────────┐│
│            │ │ │ 🃏 卡片生成    OpenAI·GPT-4o      [更换] ││
│            │ │ │ 📄 文档嵌入    Anthropic·Haiku   [更换] ││
│            │ │ │ ❓ 知识问答    OpenAI·GPT-4o Mini [更换] ││
│            │ │ │ 🎙️ 播客生成   DeepSeek·V3      [更换] ││
│            │ │ │ 🕸️ 知识图谱   Anthropic·Sonnet [更换] ││
│            │ │ │ ⚡ 快速设置: 全部使用 [GPT-4o ▼] [应用]  ││
│            │ │ └──────────────────────────────────────────┘│
│            │ │                                              │
└────────────┘ └──────────────────────────────────────────────┘
```

### 3.3 学习偏好子页

```
┌────────────┐ ┌──────────────────────────────────────────────┐
│ 子导航     │ │ 学习偏好                                      │
│            │ │                                              │
│   AI 模型  │ │ 每日新卡片数量                                │
│ ● 学习偏好 │ │ ┌──────┐┌──────┐┌──────┐┌──────┐          │
│   播客语音 │ │ │  10  ││  20  ││  30  ││  50  │          │
│   通用     │ │ │ ●    ││ ○    ││ ○    ││ ○    │          │
│            │ │ └──────┘└──────┘└──────┘└──────┘          │
│            │ │                                              │
│            │ │ 每日复习时长上限                              │
│            │ │ ┌──────┐┌──────┐┌──────┐┌──────┐          │
│            │ │ │15分钟││30分钟││45分钟││60分钟│          │
│            │ │ │ ○    ││ ●    ││ ○    ││ ○    │          │
│            │ │ └──────┘└──────┘└──────┘└──────┘          │
│            │ │                                              │
│            │ │ [保存学习设置]                                │
│            │ │                                              │
└────────────┘ └──────────────────────────────────────────────┘
```

### 3.4 播客与语音子页

```
┌────────────┐ ┌──────────────────────────────────────────────┐
│ 子导航     │ │ 播客与语音                                    │
│            │ │                                              │
│   AI 模型  │ │ 默认 TTS 提供商                               │
│   学习偏好 │ │ [自动 ▼]                                      │
│ ● 播客语音 │ │                                              │
│   通用     │ │ OpenAI TTS 模型                               │
│            │ │ [tts-1 ▼]                                     │
│            │ │                                              │
│            │ │ Fish Audio Endpoint                          │
│            │ │ [________________________________]           │
│            │ │                                              │
│            │ │ 默认输出格式                                  │
│            │ │ [MP3 ▼]                                       │
│            │ │                                              │
│            │ │ ☑ 跳过人工审阅                                │
│            │ │                                              │
│            │ │ Voice Overrides (JSON)                       │
│            │ │ ┌──────────────────────────────────────────┐│
│            │ │ │ { "host": { "voice": "alloy" },          ││
│            │ │ │   "guest": { "voice": "echo" } }        ││
│            │ │ │                                          ││
│            │ │ └──────────────────────────────────────────┘│
│            │ │                                              │
│            │ │ [保存播客设置]                                │
│            │ │                                              │
└────────────┘ └──────────────────────────────────────────────┘
```

### 3.5 通用子页

```
┌────────────┐ ┌──────────────────────────────────────────────┐
│ 子导航     │ │ 通用                                          │
│            │ │                                              │
│   AI 模型  │ │ 主题                                          │
│   学习偏好 │ │ ┌──────────────┐┌──────────────┐┌──────────┐│
│   播客语音 │ │ │ 默认纸感     ││ 手绘漫画     ││ 高对比    ││
│ ● 通用     │ │ │ ■ #fbfbf9   ││ ■ #f6eedf   ││ ■ #ffffff ││
│            │ │ │ ■ #1a1a1a   ││ ■ #2d1d12   ││ ■ #111111 ││
│            │ │ │ ■ #f8e16c   ││ ■ #d9804f   ││ ■ #111111 ││
│            │ │ │ ●           ││ ○           ││ ○        ││
│            │ │ └──────────────┘└──────────────┘└──────────┘│
│            │ │                                              │
│            │ │ 数据管理                                      │
│            │ │ [导出学习数据] [清除本地缓存]                  │
│            │ │                                              │
│            │ │ 关于                                          │
│            │ │ 学笺 XueJian v1.0.0                          │
│            │ │ 智能学习，从心开始                             │
│            │ │                                              │
└────────────┘ └──────────────────────────────────────────────┘
```

---

## 4. 组件树

```
SettingsPage（重构）
├── SettingsSubNav                  ← 🆕 新增：左侧子导航
│   ├── SubNavItem "AI 模型"        ← 🆕
│   ├── SubNavItem "学习偏好"       ← 🆕
│   ├── SubNavItem "播客与语音"     ← 🆕
│   └── SubNavItem "通用"           ← 🆕
│
├── SettingsAiModelSection         ← 🆕 新增/改造：AI 模型设置
│   ├── ProviderConfigGrid         ← BYOK 文档定义
│   │   └── ProviderConfigCard ×N  ← BYOK 文档定义
│   │       ├── ProviderIcon
│   │       ├── ConfigStatus       ← ✅已配 / ⚠️未配
│   │       ├── ModelName
│   │       └── ActionButton       ← [编辑] / [配置]
│   │
│   └── WorkflowAssignmentPanel    ← BYOK 文档定义
│       ├── WorkflowRow ×5         ← 工作流→模型映射
│       └── QuickAssignBar         ← 快速设置全部模型
│
├── SettingsLearningSection        ← 🆕 新增/改造：学习偏好
│   ├── DailyNewCardLimitSelect    ← 改造自现有
│   ├── ReviewTimeLimitSelect      ← 改造自现有
│   └── SaveButton
│
├── SettingsPodcastSection         ← 🆕 新增/改造：播客与语音
│   ├── TtsProviderSelect          ← 改造自现有
│   ├── OpenaiModelInput           ← 改造自现有
│   ├── FishAudioEndpointInput    ← 改造自现有
│   ├── OutputFormatSelect         ← 改造自现有
│   ├── SkipReviewCheckbox         ← 改造自现有
│   ├── VoiceOverridesTextarea    ← 改造自现有
│   └── SaveButton
│
└── SettingsGeneralSection         ← 🆕 新增：通用设置
    ├── ThemeSelector              ← 🆕 新增：主题选择器
    ├── DataManagementPanel        ← 🆕 新增：数据管理
    └── AboutSection               ← 🆕 新增：关于信息
```

---

## 5. 组件接口规格

### 5.1 SettingsSubNav（🆕 新增）

```typescript
interface SettingsSubNavProps {
  items: Array<{ id: string; label: string; icon?: ReactNode }>
  activeId: string
  onSelect: (id: string) => void
  className?: string
}
```

**视觉规格**：
- 容器：`w-48 shrink-0 border-r border-line-soft/60 bg-paper-muted/50`
- 活动项：`border-l-2 border-l-ink bg-ink/5 px-4 py-2.5 font-ui text-sm text-ink font-medium`
- 非活动项：`px-4 py-2.5 font-ui text-sm text-ink-muted hover:text-ink hover:bg-ink/3 cursor-pointer`
- 顶部标题：`px-4 py-3 font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft`

**移动端**：子导航变为顶部水平 Tab 栏

### 5.2 ThemeSelector（🆕 新增）

```typescript
interface ThemeSelectorProps {
  currentThemeId: AppThemeId
  onThemeChange: (themeId: AppThemeId) => void
  className?: string
}
```

**视觉规格**：
- 布局：`grid grid-cols-3 gap-3`
- 每个主题卡片：`rounded-card border border-line-soft bg-paper-card p-4 cursor-pointer`
- 选中态：`border-ink/30 ring-2 ring-ink/10`
- 色卡展示：3 个小色块（paper/ink/accent），`h-6 w-full rounded-sketch`
- 标题：`font-ui text-sm text-ink`
- 描述：`font-body text-xs text-ink-muted`
- 选中指示：`RoughCircleNumber` 包裹的 `●` 或 `○`

### 5.3 DataManagementPanel（🆕 新增）

```typescript
interface DataManagementPanelProps {
  onExportData: () => void
  onClearCache: () => void
  className?: string
}
```

**视觉规格**：
- 容器：`rounded-card border border-line-soft bg-paper-base/82 p-4`
- 按钮：`Button variant="outline" className="rounded-full"` ×2
- 描述：`font-body text-xs text-ink-muted`

### 5.4 AboutSection（🆕 新增）

```typescript
interface AboutSectionProps {
  version: string
  className?: string
}
```

**视觉规格**：
- 容器：`rounded-card border border-line-soft bg-paper-base/82 p-4`
- 应用名：`font-display text-lg text-ink`
- 版本：`font-latin-meta text-xs text-ink-soft`
- 标语：`font-body text-sm text-ink-muted`

---

## 6. 交互状态矩阵

### 6.1 AI 模型子页

| 状态 | 触发条件 | 展示 |
|------|----------|------|
| **noConfig** | 无 API 配置 | `SketchEmptyState illustration="note"` + "添加第一个 API 配置" |
| **hasConfigs** | 有配置 | ProviderConfigGrid + WorkflowAssignmentPanel |
| **testing** | 连接测试中 | 按钮显示 spinner |
| **testSuccess** | 测试通过 | 绿色提示 "连接成功！响应耗时 Nms" |
| **testFail** | 测试失败 | 红色提示 + 错误信息 |

### 6.2 学习偏好子页

| 状态 | 展示 |
|------|------|
| **loading** | skeleton |
| **loaded** | 选项组 + 保存按钮 |
| **saving** | 保存按钮 loading |
| **saved** | 短暂绿色提示 |

### 6.3 通用子页

| 状态 | 展示 |
|------|------|
| **normal** | 主题选择器 + 数据管理 + 关于 |
| **clearing** | 清除按钮 loading + 确认弹窗 |
| **exporting** | 导出按钮 loading |

---

## 7. 数据绑定表

| 子页 | 数据项 | Hook | Gateway | Rust 命令 | 状态 |
|------|--------|------|---------|-----------|------|
| AI 模型 | apiConfigs | `useApiConfigsQuery()` | BYOK 系统 | BYOK 命令集 | ✅ BYOK |
| AI 模型 | workflowAssignments | BYOK 系统 | BYOK 系统 | BYOK 命令集 | ✅ BYOK |
| AI 模型 | 连接测试 | `useTestApiConnectionMutation()` | BYOK 系统 | `test_api_connection` | ✅ BYOK |
| 学习偏好 | dailyNewCardLimit, reviewTimeLimit | `useAppSettingsQuery()` | 已有 | `get_settings` | ✅ |
| 学习偏好 | 保存 | `useUpdateAppSettingsMutation()` | 已有 | `update_settings` | ✅ |
| 播客与语音 | podcastTtsProvider 等 | `useAppSettingsQuery()` | 已有 | `get_settings` | ✅ |
| 播客与语音 | 保存 | `useUpdateAppSettingsMutation()` | 已有 | `update_settings` | ✅ |
| 通用 | themeId | `useAppThemeId()` | 已有 | — | ✅ |
| 通用 | 清除缓存 | 🆕 mutation | 🆕 | 🆕 `clear_local_cache` | 🆕 |

---

## 8. 响应式策略

| 断点 | 子导航 | 内容区 |
|------|--------|--------|
| **xl+** | 左侧 `w-48` 固定 | 右侧 `flex-1` |
| **lg** | 左侧 `w-40` | 右侧 `flex-1` |
| **md** | 顶部水平 Tab 栏 | 下方全宽 |
| **sm** | 顶部水平 Tab 栏（紧凑） | 下方全宽 |

**移动端子导航变体**：
- 水平排列，`overflow-x-auto`
- 活动项底部 `RoughUnderline` 指示（替代左侧竖线）
- 可滑动

---

## 9. 可访问性要点

| 元素 | ARIA / 键盘 |
|------|-------------|
| 子导航 | `role="tablist"`，每项 `role="tab"` + `aria-selected` |
| 内容区 | `role="tabpanel"` + `aria-labelledby` |
| 供应商卡片 | `role="button"` + `aria-label="编辑 OpenAI 配置"` |
| 连接测试 | `aria-live="polite"` 显示测试结果 |
| 主题选择器 | `role="radiogroup"`，每项 `role="radio"` + `aria-checked` |
| 清除确认弹窗 | 焦点陷阱，Escape 关闭 |

---

## 10. 与现有组件的复用关系

| 已有组件 | 复用方式 |
|----------|----------|
| `Panel` | 子导航/内容区容器 |
| `Button` | 所有操作按钮 |
| `RoughUnderline` | 移动端 Tab 活动指示 |
| `SketchEmptyState` | 无 API 配置空状态 |
| BYOK 组件族 | ProviderConfigGrid / WorkflowAssignmentPanel（见 byok-system.md） |

---

## 11. 迁移路径

1. **新增 SettingsSubNav 组件**：左侧子导航
2. **拆分现有 SettingsPage 内容**：提取为 4 个 Section 组件
3. **新增 SettingsGeneralSection**：主题选择器 + 数据管理 + 关于
4. **AI 模型子页对接 BYOK 系统**：详见 `byok-system.md`
5. **保留 onboarding 强制跳转逻辑**：无 API 配置时仍锁定在 AI 模型子页
6. **删除旧 `useAppStore` 的 `aiConfig` 引用**：迁移到 `useApiConfigsQuery`
