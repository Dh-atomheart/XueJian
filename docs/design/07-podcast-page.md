# 播客工坊设计规格

> NavItemId: `podcast` | 路由组件: `PodcastPage`（`features/podcast/`）
> 设计令牌引用: 见总览文档 §设计令牌速查

---

## 1. 页面概述

### 1.1 定位

播客工坊是**AI 播客生成与管理中心**，双 Tab 布局：

- **创建播客** Tab：配置参数并启动播客生成工作流
- **我的播客** Tab（🆕）：浏览已生成/生成中的播客列表，播放/下载/管理

### 1.2 核心用户场景

| 场景 | 用户行为 | 页面响应 |
|------|----------|----------|
| 创建播客 | 选择文档 + 配置参数 → 启动 | 工作流启动 → 轮询状态 |
| 查看进度 | 切换到"我的播客" | 列表显示各播客状态 |
| 播放播客 | 点击播放 | 内置播放器 |
| 下载音频 | 点击下载 | 保存到本地 |
| 重新生成 | 点击重新生成 | 重试工作流 |
| 取消生成 | 点击取消 | 取消工作流 |
| 删除播客 | 点击删除 | 确认后删除 |

### 1.3 播客工作流阶段

```
排队 → 检索 → 大纲 → 脚本 → 评估 → 语音合成 → 音频拼接 → 完成
```

每个阶段对应不同的 UI 状态展示。

---

## 2. 设计令牌引用

| 元素 | 令牌/组件 | 说明 |
|------|-----------|------|
| Tab 栏 | `TabBar` 🆕 | 水平 Tab 切换 |
| 参数区 | `Panel variant="paperCard"` | 创建播客配置面板 |
| 选项组 | `rounded-item border border-line-soft` | 风格/时长/语言选项 |
| 选中选项 | `border-ink/30 bg-ink/5` | 选中态 |
| 播客列表项 | `rounded-card border border-line-soft bg-paper-card` | 播客历史卡片 |
| 状态徽章 | `rounded-full text-xs font-ui` | 生成中/完成/失败 |
| 播放器 | `Panel variant="toolbar"` | 底部播放控制 |
| 空状态 | `SketchEmptyState illustration="podcast"` | 无播客时 |
| 进度条 | `SketchProgress` | 生成进度 |
| 参数标签 | `font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft` | 参数分类标签 |

---

## 3. 布局线框图

### 3.1 创建播客 Tab

```
┌──────────────────────────────────────────────────────────────────┐
│ 播客工坊                                                         │
├──────────────────────────────────────────────────────────────────┤
│ ┌─ TabBar ────────────────────────────────────────────────────┐ │
│ │ [● 创建播客]  [我的播客]                                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 选择文档: [机器学习基础 ▼]                                   │ │
│ │                                                              │ │
│ │ 风格                                                         │ │
│ │ ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐                  │ │
│ │ │○访谈 ││○深挖 ││●讲授 ││○闲聊 ││○冲刺 │                  │ │
│ │ └──────┘└──────┘└──────┘└──────┘└──────┘                  │ │
│ │                                                              │ │
│ │ 时长                                                         │ │
│ │ ┌──────┐┌──────┐┌──────┐┌──────┐                          │ │
│ │ │○短   ││○中   ││●长   ││○超长 │                          │ │
│ │ └──────┘└──────┘└──────┘└──────┘                          │ │
│ │                                                              │ │
│ │ 语言: [中文 ▼]   TTS: [自动 ▼]   格式: [MP3 ▼]             │ │
│ │                                                              │ │
│ │ ☑ 跳过人工审阅                                               │ │
│ │                                                              │ │
│ │ [生成播客]                                                   │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 我的播客 Tab（🆕 新增）

```
┌──────────────────────────────────────────────────────────────────┐
│ ┌─ TabBar ────────────────────────────────────────────────────┐ │
│ │ [创建播客]  [● 我的播客]                                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 筛选: [全部状态 ▼] [按文档 ▼]     搜索: ________           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 🎙️ 机器学习基础 - 访谈风格                    ✅ 已完成      │ │
│ │    时长: 12:34  ·  创建于: 2024-01-15                       │ │
│ │    [▶ 播放] [下载] [重新生成] [删除]                        │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │ 🎙️ 深度学习笔记 - 深挖风格                    ⏳ 语音合成   │ │
│ │    SketchProgress 67%  ·  创建于: 2024-01-16               │ │
│ │    [取消]                                                   │ │
│ ├──────────────────────────────────────────────────────────────┤ │
│ │ 🎙️ 算法导论 - 讲授风格                        ❌ 失败       │ │
│ │    错误: TTS 服务不可用  ·  创建于: 2024-01-14              │ │
│ │    [重试] [删除]                                            │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ ▶ 播放器: 机器学习基础 - 访谈风格          03:24 / 12:34    │ │
│ │ [⏮] [⏯] [⏭]  ━━━━━━━●━━━━━━━━━  音量: ━━━●━━━          │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 组件树

```
PodcastPage（增强）
├── TabBar                          ← 🆕 新增（复用 CardStudio 的 TabBar）
│   ├── TabItem "创建播客"
│   └── TabItem "我的播客"
│
├── 创建播客 Tab
│   └── （现有组件保持不变）
│       ├── DocumentSelect
│       ├── StyleSelect
│       ├── DurationSelect
│       ├── LanguageSelect
│       ├── TtsProviderSelect
│       ├── FormatSelect
│       ├── SkipReviewCheckbox
│       └── GenerateButton
│
└── 我的播客 Tab                    ← 🆕 新增
    ├── PodcastHistoryToolbar       ← 🆕 新增：筛选/搜索
    │   ├── StatusFilterSelect
    │   ├── DocumentFilterSelect
    │   └── SearchInput
    │
    ├── PodcastHistoryList          ← 🆕 新增：播客列表
    │   └── PodcastHistoryItem ×N  ← 🆕 新增：单条播客记录
    │       ├── EpisodeInfo         ← 🆕：标题/风格/时长/日期
    │       ├── EpisodeStatus       ← 🆕：状态徽章 + 进度
    │       └── EpisodeActions      ← 🆕：播放/下载/重试/取消/删除
    │
    ├── PodcastPlayerBar            ← 🆕 新增：底部播放器
    │   ├── PlayControls
    │   ├── ProgressBar
    │   └── VolumeControl
    │
    └── SketchEmptyState           ← 已有，复用（无播客时）
```

---

## 5. 组件接口规格

### 5.1 PodcastHistoryItem（🆕 新增）

```typescript
interface PodcastHistoryItemProps {
  episode: PodcastEpisode
  onPlay: (episode: PodcastEpisode) => void
  onDownload: (episode: PodcastEpisode) => void
  onRetry: (episodeId: string) => void
  onCancel: (episodeId: string) => void
  onDelete: (episodeId: string) => void
  isPlaying: boolean
  className?: string
}
```

**视觉规格**：
- 容器：`rounded-card border border-line-soft bg-paper-card p-5 shadow-card`
- 标题行：`font-ui text-sm text-ink` + 状态徽章
- 元数据行：`font-body text-xs text-ink-soft`
- 操作按钮：`Button variant="ghost" size="sm" className="rounded-full"`
- 状态徽章颜色：
  - 完成：`bg-highlight-green/30 text-ink`
  - 生成中：`bg-highlight-blue/30 text-ink`
  - 失败：`bg-highlight-pink/30 text-ink`
  - 排队：`bg-paper-soft text-ink-muted`

### 5.2 PodcastPlayerBar（🆕 新增）

```typescript
interface PodcastPlayerBarProps {
  episode: PodcastEpisode | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onVolumeChange: (volume: number) => void
  onClose: () => void
  className?: string
}
```

**视觉规格**：
- 容器：`Panel variant="toolbar" className="rounded-panel sticky bottom-0"`
- 布局：`flex items-center gap-4`
- 进度条：`SketchProgress` 或自定义滑块
- 时间显示：`font-latin-meta text-xs text-ink-soft tabular-nums`
- 播放/暂停按钮：`Button variant="ghost" size="icon" className="rounded-full"`

### 5.3 PodcastHistoryToolbar（🆕 新增）

```typescript
interface PodcastHistoryToolbarProps {
  statusFilter: EpisodeStatus | 'all'
  onStatusFilterChange: (status: EpisodeStatus | 'all') => void
  documentFilter: string | 'all'
  onDocumentFilterChange: (docId: string | 'all') => void
  searchQuery: string
  onSearchChange: (query: string) => void
  className?: string
}
```

---

## 6. 交互状态矩阵

| 状态 | 触发条件 | 展示 |
|------|----------|------|
| **empty** | 无播客记录 | `SketchEmptyState illustration="podcast"` title="还没有播客" |
| **loading** | 加载播客列表 | skeleton |
| **hasEpisodes** | 有播客记录 | 列表展示 |
| **playing** | 正在播放 | 底部播放器固定 |
| **generating** | 某播客生成中 | 进度条 + "取消"按钮 |
| **failed** | 某播客失败 | 错误信息 + "重试"按钮 |

---

## 7. 数据绑定表

| 组件 | 数据项 | Hook | Gateway | Rust 命令 | 状态 |
|------|--------|------|---------|-----------|------|
| 创建播客 | startPodcast | `useStartPodcastMutation()` | 已有 | `start_podcast_workflow` | ✅ |
| 我的播客 | episodes | `usePodcastEpisodesQuery()` | 已有 | `list_podcast_episodes` | ✅ |
| 单条播客 | episode detail | `usePodcastEpisodeQuery()` | 已有 | `get_podcast_episode` | ✅ |
| 音频段 | segments | `usePodcastAudioSegmentsQuery()` | 已有 | `get_podcast_audio_segments` | ✅ |
| 取消 | cancelEpisode | `useCancelPodcastMutation()` | 已有 | `cancel_podcast_episode` | ✅ |
| 删除 | deleteEpisode | `useDeletePodcastMutation()` | 已有 | `delete_podcast_episode` | ✅ |
| 重试 | retryEpisode | `useRetryPodcastMutation()` | 已有 | `retry_podcast_episode` | ✅ |
| 审阅脚本 | reviewScript | `useReviewPodcastScriptMutation()` | 已有 | `review_podcast_script` | ✅ |
| TTS 设置 | appSettings | `useAppSettingsQuery()` | 已有 | `get_settings` | ✅ |

**注**：播客数据查询已完整，主要是前端 Tab 视图和列表 UI 的新增。

---

## 8. 响应式策略

| 断点 | 布局 |
|------|------|
| **xl+** | 参数区 2 列，播客列表全宽 |
| **lg** | 参数区 1 列 |
| **md** | 参数区 1 列，播客列表项紧凑 |
| **sm** | 参数区 1 列，播放器简化 |

---

## 9. 可访问性要点

| 元素 | ARIA / 键盘 |
|------|-------------|
| 播放/暂停 | `aria-label="播放/暂停"` |
| 进度条 | `role="slider"` + `aria-valuenow` / `aria-valuemax` |
| 音量控制 | `role="slider"` + `aria-label="音量"` |
| 删除确认 | 焦点陷阱弹窗 |

---

## 10. 改造要点

1. **新增 TabBar**：创建播客 / 我的播客 切换
2. **新增"我的播客" Tab**：PodcastHistoryList + PodcastHistoryItem
3. **新增底部播放器**：PodcastPlayerBar
4. **新增筛选/搜索工具栏**：PodcastHistoryToolbar
5. **圆角修正**：硬编码圆角 → token 引用
