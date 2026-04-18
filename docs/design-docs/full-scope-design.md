---
title: Full-Scope Frontend Design
status: active
owner: design
last_reviewed: 2026-04-18
canonical: true
---

# 学笺全阶段前端设计方案

本文件是在 `foundation.md` / `tokens.md` / `components.md` / `pages.md` / `interactions.md`
五份基线之上，向 V2 / V3 / V4 阶段延伸的页面、组件与交互规范补充。
当本文件与上位规范冲突时，以 `product-specs/*.md` 为准。

## 0. 阅读前提

- 视觉锚点沿用 `纸感工作台 + 细墨线工具界面 + 贴笺式学习上下文`
- 手绘漫画强度保持 **中度**：手绘感只出现在壳层装饰、卡片/贴笺外轮廓、标题下划线、空状态插画和主题切换后的 `comic-sketch` 细节中。正文、表单控件、PDF 热区、数据输入始终保持清晰
- 所有新增组件必须走 `SurfaceVariant` + `ThemeTokens`，不新增独立色板

## 1. 全阶段页面地图

| 页面 | 路由 | Shell 变体 | 阶段 | 主要功能 ID |
|------|------|------------|------|------------|
| Dashboard | `/` | `dashboard` | MVP | 1/4/7/8 |
| Library | `/documents` | `library` | MVP | 1 |
| Reader | `/documents/:id` | `reader` | MVP | 1/2/4 |
| CardStudio | `/cards` | `library` | MVP | 1/4 |
| Review | `/learn` | `review` | MVP | 4/7 |
| Settings | `/settings` | `settings` | MVP | 9 |
| Knowledge QA | `/knowledge` | `library` | V2 | 3 |
| Animation Studio | 卡片内模态 | `review` / modal | V3 | 5 |
| Podcast Studio | `/podcast`（暂入口在设置或 Dashboard） | `library` | V3 | 6 |
| Knowledge Graph | `/graph` | `library` | V4 | — |

所有阶段均不新增二级站点导航，`SidebarRail` 仅在对应阶段启用新图标位。
V2 起 `Knowledge QA` 复用现有 `knowledge` 导航槽位；V3/V4 新槽位优先放 `播客` 和 `图谱`，
当阶段未激活时对应槽位隐藏，不做灰态占位。

## 2. 卡片模型（功能 1 / 4 / 5 / 6 / 7 的公共心智）

设计与实现必须对齐以下语义（落地层 schema 已存在于 `xuejian/src/types/schema.ts:cardSchema`）：

- `front`：卡片正面，承载问题或极简提示
- `back`：卡片背面，承载完整答案与补充
- `groupId`：相似内容分组（用户手动维护或由生成流程建议）
- `documentId` + `anchorId` + `sourcePage` + `sourceCoordinates`：来源文档锚点，支撑贴笺式联动
- `tags`：主题维度，用于簇级聚合视图
- `state` + FSRS 参数（`difficulty`/`stability`/`retrievability`/`nextReview`）：功能 7 调度

**视觉上，「组」和「簇」的区分原则：**

- `组 (Group)`：相似卡片集合，视觉上是一摞贴笺纸叠放；用一级手绘矩形包裹。
- `簇 (Cluster)`：多个组共享标签/主题组成；用二级更细的虚线框或标题带下划线强调。
- 用户看到的视觉层级：`卡片 < 组 < 簇 < 文档/知识库`。

## 3. Dashboard 细化（功能 7 / 8）

在 `pages.md §4` 基础上补充：

### 3.1 区域布局

```text
┌─────────────────────────────────────────────┐
│ 今日任务条：大数字 + 开始学习 CTA             │  paperCard
├──────────────────────┬──────────────────────┤
│ 最近文档列表          │ 快速开始 / 学习概览    │  paperCard x2
├──────────────────────┴──────────────────────┤
│ 学习热力图 (HeatmapCalendar) + 总时长卡片    │  paperCard
└─────────────────────────────────────────────┘
```

### 3.2 热力图契约

- 组件路径：`xuejian/src/components/stats/HeatmapCalendar.tsx`
- 数据源：`ReviewLog.reviewedAt`，按自然日聚合 count；上限以最近 12 周为默认
- 视觉：7 行 × N 列 网格，每格 `10px × 10px`，圆角 `2px`
- 色阶：`paper-soft -> highlight-green/40 -> highlight-green/70 -> highlight-green`
- `comic-sketch` 主题下格子外描 `0.5px` 墨线，模仿手绘方格
- 交互：hover 触发 tooltip `2026-04-18 · 复习 12 张 · 学习 8 分钟`
- 状态：`loading` 骨架显示空格网；`empty` 保留网格并显示"开始第一轮学习后会在此记录"弱提示

### 3.3 总时长卡片

- 指标：今日 / 本周 / 累计 学习时长（未实现时显示 `--`，不隐藏）
- 字体：标题 `font-ui`，数值 `font-display tabular-nums`
- 不使用大块彩色背景，依赖排版与留白建立层次

## 4. Library 细化

与 `pages.md §5` 保持一致，补充：

- 上传状态徽章需要覆盖 `uploading / parsed / indexing / generating / ready / error` 6 种
- 徽章使用 `highlight.*` 作为极小面积点缀，主体仍是灰度
- `DocumentCard` 右上角保留"重新生成卡片"快捷入口（图标按钮，tooltip 说明）
- 批量导出入口放在列表顶部右侧，使用 `sketch` 变体按钮强调

## 5. Reader 细化（功能 2）

`ContextRail` 的贴笺卡片必须显式表达"这是一张纸条，它在告诉你第 X 页发生了什么"的心智：

### 5.1 贴笺卡片样式

- 基础：`surface-stickyNote` + 圆角 `18px` + `shadow-sticky`
- `comic-sketch` 下附加 `2px` 暗边墨线和 `translate(-1px, -1px)` 偏移，营造便签贴纸错位感
- 每张贴笺必须显示：页码徽章、问题（卡片 `front`）、原文片段（来自 `highlight.textContent` 或 `card.back` 截断）、来源标签
- 选中时背景切换到 `highlight-yellow/25`，边框 `ink/25`，轻度浮起 `-2px`

### 5.2 联动规则

- PDF → 贴笺：翻页或选中文本时，右栏当前页贴笺块顶部滚动并以 160-220ms 过渡高亮新增
- 贴笺 → PDF：点击贴笺时使用 `useAppUiStore.selectCard` 设置选中 + `setReaderPage`
- 选中文本创建卡片：选区菜单出现"记入贴笺"按钮；完成后新贴笺从 `translateY(6px) scale(0.98)` 渐入

### 5.3 空态

- 当前页无贴笺时显示虚线手绘便签 + 引导文案：`在正文里圈出关键句，这里会长出便签`
- 不出现"暂无数据"这种后台式文案

## 6. CardStudio（功能 1 / 4）

独立于 Library 的卡片生产线页面，已存在 `features/cards/CardStudioPage.tsx`，本文件只补契约：

### 6.1 三栏布局

```text
┌──────────┬──────────────────────┬──────────┐
│ 文档/簇   │ 卡片候选与正式卡片    │ 卡片编辑  │
│ Selector │ CardCandidatePanel   │ Editor   │
└──────────┴──────────────────────┴──────────┘
```

### 6.2 CardCandidatePanel

- 路径建议：`xuejian/src/components/cards/CardCandidatePanel.tsx`
- 每条候选必须包含：来源页号 / 来源摘录 / 置信度条（低饱和色）/ `接受`、`编辑`、`丢弃` 三个按钮
- 批量接受置底部粘连条，显示 `已选 N/共 M`，最多允许一次批量接受（防误操作）
- 候选状态：`pending` 灰底虚线框；`accepted` 绿色极细高光；`rejected` 折叠为单行占位
- 新增成功反馈：行内打勾图标 1200ms 后消失

### 6.3 CardClusterView

- 路径建议：`xuejian/src/components/cards/CardClusterView.tsx`
- 视图模式：`flat` 平铺 | `group` 按 `groupId` 折叠 | `cluster` 按共享 tag 聚合
- `group` 视图下使用纸堆叠效果：最上层正常显示，底下两张偏移 `2-4px` + 渐深
- 空组不显示，避免页面堆栈空框

### 6.4 导出

- 支持 Anki `.apkg`、Markdown、CSV 三类（实现可分阶段）
- 导出按钮放置在右上 `sketch` 变体，触发确认 modal

## 7. Review 细化（功能 4 / 5 / 7）

与 `pages.md §7` 一致，补充：

- `FlipCard` 增加 `variant: 'default' | 'sketch'` 参数；`sketch` 模式启用 `2px` 墨线外框与翻页投影
- 翻面动效：CSS `transform: rotateY(180deg)` + `backface-visibility: hidden`，持续 220ms，ease-out
- 背面增加"知识动画"按钮（已存在入口，改成 `sketch` 变体低饱和）
- 评分条维持当前四色方案；在 `comic-sketch` 主题下按钮底部增加 `inset 0 -2px 0 ink/10`

## 8. Settings 细化（功能 9）

- BYOK 表单按提供商分组：`OpenAI 兼容`、`Anthropic 兼容`、`自定义`
- 每组必须含：名称、`baseUrl`（可空，默认由协议推断）、API Key 输入（密文）、默认模型、预算上限
- 单次保存后立即显示"测试连接"次级按钮，成功态用极细绿色高亮线（`highlight-green` 下划线），失败态使用 `highlight-pink/40` 内联提示并提供可复制的错误原文
- 主题切换维持现有 3 档；未来新增主题包（V4）时保持同一卡片网格

## 9. Knowledge QA 细化（V2 功能 3）

在现有 `features/knowledge/KnowledgeQaPage.tsx` 基础上目标规范：

### 9.1 布局

```text
┌──────────────────────────────────────────┐
│ 文档范围选取（DocScopeChips）            │  paperCard
├──────────────────────────────────────────┤
│ 对话区（QaHistory）                      │  canvas
│   - 用户问题（右对齐，沉色卡片）          │
│   - 模型回答（左对齐，贴笺感浅卡片）       │
│   - 引用片段（内嵌小卡，点击跳回 Reader）  │
├──────────────────────────────────────────┤
│ 输入区（question Input + 发送）          │  toolbar
└──────────────────────────────────────────┘
```

### 9.2 引用溯源

- 引用片段必须同时显示：文档标题、页号、原文摘录（≤ 160 字，超出省略号）、相关度条
- 点击跳回原文时，通过 `useAppUiStore.openReader(documentId)` 并让 Reader 初始化到对应页
- 无引用时在回答底部显示弱提示 `未检索到可信引用，结果仅供参考`

### 9.3 状态矩阵

| 状态 | 设计 |
|------|------|
| `first-use` | 空对话引导：列出 3 条示例问题（按 tag 推荐） |
| `processing` | 回答卡片内显示三点脉动 + `正在从知识库检索…`，禁用再次发送 |
| `error` | 回答卡片错色边框，给出 `重试` / `换个问题` 两个动作 |
| `success` | 引用渐入，无模态阻塞 |

## 10. Animation Studio（V3 功能 5）

### 10.1 触发点

- Review 页卡片背面的"知识动画"按钮
- CardStudio 编辑器的"生成演示"按钮

### 10.2 AnimationPreviewModal

- 已有骨架 `xuejian/src/components/cards/AnimationPreviewModal.tsx`
- 目标契约：
  - 模态居中 `modal` surface，最大宽 `880px`，高度自适应 max `80vh`
  - 顶部：卡片问题简要回显 + 关闭按钮
  - 主区：`AnimationRenderer`（p5.js / manim 结果 iframe / video tag 二选一）
  - 底部：生成配置栏（工具选择：`p5.js` | `manim`）+ `重新生成` + `保存到卡片`
- 状态：
  - `idle`：显示上次渲染结果（若有）或"点击生成以预览"
  - `generating`：中央骨架 + 进度条（若后端返回 progress）
  - `success`：主区显示画布，底栏允许调节参数
  - `error`：给出错误原文 + 可复制错误，保留上一次成功结果

### 10.3 视觉

- 画布背景用 `paper-base`，避免深色让动画突兀
- 工具选择按钮用 `outline`；`sketch` 变体仅用于"生成"主按钮

## 11. Podcast Studio（V3 功能 6）

### 11.1 入口与页面

- MVP 不出现入口；V3 激活后在 SidebarRail 插入"播客"槽位
- 页面布局类似 Library：左侧文档/簇选取，右侧脚本 + 音频

### 11.2 组件

- `PodcastScopeSelector`：多选文档 + 可选卡片簇，显示预估 token 与时长
- `PodcastScriptPreview`：显示对话稿（主持 A / 主持 B 色调略异，基于 `highlight.blue` / `highlight.green` 的极浅描边）
- `PodcastPlayerModal`：已有骨架，增加进度条、0.75x/1x/1.25x/1.5x 速度切换、章节跳转

### 11.3 状态

- `scripting` / `voicing` / `ready` / `error` 四态，顶部步骤条显示当前阶段

## 12. Knowledge Graph（V4）

### 12.1 布局

- 左侧节点筛选（类型、标签、来源文档）
- 主区 Canvas，力导向或径向布局
- 右侧节点详情：节点名、来源（文档 + 页号）、关联卡片、关联节点

### 12.2 视觉

- 节点：圆形 `12-18px`，描边 `0.75px ink`，填充按类型映射到 `highlight.*`
- 边：`0.5px line-soft`，hover 时加粗到 `1px`
- `comic-sketch` 下启用节点外的手绘微抖动路径（低频，不做动画）

## 13. 组件契约总表（新增 + 增强）

| 组件 | 路径 | 阶段 | 状态 | 主要输入 |
|------|------|------|------|---------|
| `HeatmapCalendar` | `components/stats/HeatmapCalendar.tsx` | MVP | 新增 | `entries: { date: string; count: number }[]`, `weeks?: number` |
| `StudyTotalsCard` | `components/stats/StudyTotalsCard.tsx` | MVP | 新增 | `today/week/total` 分钟数 |
| `CardCandidatePanel` | `components/cards/CardCandidatePanel.tsx` | MVP | 目标契约 | `candidates: CardCandidate[]`, 事件回调 |
| `CardClusterView` | `components/cards/CardClusterView.tsx` | MVP | 目标契约 | `cards: Card[]`, `mode: 'flat'\|'group'\|'cluster'` |
| `SketchEmptyState` | `components/ui/SketchEmptyState.tsx` | MVP | 新增 | 手绘插画 + 标题 + 描述 + CTA |
| `FlipCard` | `components/learning/FlipCard.tsx` | MVP | 增强 `variant` | 新增 `variant?: 'default' \| 'sketch'` |
| `StickyNotesPanel` | `components/documents/StickyNotes/StickyNotesPanel.tsx` | MVP | 增强视觉 | 现有 |
| `KnowledgeChatPanel` | `components/knowledge/KnowledgeChatPanel.tsx` | V2 | 目标契约 | `history`, `onAsk`, `onOpenCitation` |
| `AnimationPreviewModal` | `components/cards/AnimationPreviewModal.tsx` | V3 | 增强 | 现有 |
| `PodcastPlayerModal` | `components/podcast/PodcastPlayerModal.tsx` | V3 | 增强 | 现有 |
| `GraphCanvas` | `components/graph/GraphCanvas.tsx` | V4 | 目标契约 | `nodes`, `edges` |

## 14. 视觉细则补充

### 14.1 纸堆叠效果

用于 `CardClusterView` 的 group 模式：

```css
/* 顶层卡片正常；底下两层伪元素 */
position: relative;
&::before, &::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
&::after  { transform: translate(2px, 3px); background: var(--paper-card); border: 0.5px solid var(--line-soft); z-index: -1; opacity: 0.85; }
&::before { transform: translate(5px, 6px); background: var(--paper-card); border: 0.5px solid var(--line-soft); z-index: -2; opacity: 0.7; }
```

### 14.2 手绘 SketchFrame 工具类

- 在 `index.css` 增加 `.sketch-frame` 和 `.sketch-underline` 两个组合类，仅对 `data-theme='comic-sketch'` 生效
- `sketch-frame`：叠加 `inset 0 0 0 0.5px rgb(var(--ink)/0.35)` + `box-shadow: 2px 3px 0 rgb(var(--ink)/0.08)`
- `sketch-underline`：使用 `background-image: linear-gradient(...)` 绘制带噪点的下划线，仅 1px 高

### 14.3 空状态插画

- 位置：`public/illustrations/` 新增 SVG 图
- 主题：便签、书本、对话气泡、播客耳机、图谱节点，统一单线墨描 + 极浅色填充
- 禁止：彩色渐变、拟人吉祥物、3D 投影

## 15. 交互流程（跨页）

### 15.1 文档 → 卡片 → 学习主链路

```
Library 上传
  → Library 解析中
  → CardStudio 候选确认
  → Library / Reader 看到正式卡片
  → Review 复习
  → Dashboard 看到热力图更新
```

### 15.2 知识问答 → 回到 Reader

```
Knowledge QA 提问
  → 回答卡 + 引用片段
  → 点击引用
  → openReader(documentId, page)
  → ContextRail 显示相关贴笺
```

### 15.3 卡片 → 动画 / 播客

```
Review / CardStudio 卡片选定
  → 点击「知识动画」 / 「生成播客」
  → 模态预览生成过程
  → 保存到卡片或导出
```

## 16. 实施优先级

| 优先级 | 事项 | 对应功能 ID |
|-------|------|-----|
| P0 | Dashboard 热力图 + 增强 | 7/8 |
| P0 | FlipCard sketch 变体 | 4 |
| P0 | StickyNotesPanel 贴笺视觉增强 | 2 |
| P0 | SketchEmptyState 基础组件 + 插画 | 通用 |
| P1 | CardCandidatePanel / CardClusterView 骨架 | 1/4 |
| P1 | KnowledgeChatPanel 对话增强 | 3 |
| P2 | AnimationPreviewModal / PodcastPlayerModal 状态补齐 | 5/6 |
| P3 | GraphCanvas 骨架 | V4 |

## 17. 不做什么

- 不为 V2/V3/V4 改动 `product-specs/mvp.md` 任何字段
- 不引入新的色系或渐变主色
- 不把手绘风格压到输入、表格、PDF 文字上
- 不在 Dashboard 做 KPI 仪表盘式矩阵
- 不把播客 / 动画入口放在 MVP 导航里
