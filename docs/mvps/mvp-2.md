# MVP-2：PDF 阅读联动与学习统计体验

## 目标

MVP-2 在 MVP-0 和 MVP-1 的数据基础上提升体验连贯性，让 PDF、卡片、复习和统计形成清晰反馈。

```text
PDF Reader -> 当前页相关卡片 -> 来源回看 -> study_events -> 学习仪表盘
```

## 完成定义

MVP-2 完成时，用户应能：

- 在沉浸式 Reader 中阅读 PDF。
- 在右侧看到当前页相关卡片。
- 从卡片看到来源页码和 source quote。
- 在首页看到学习热力图。
- 看到今日完成数、总学习时长、连续学习天数。
- 看到文档进度和分组进度概览。
- 在 Reader、复习页和统计图窄宽度下不发生重叠。

## 不做什么

MVP-2 明确不做：

- 精确词级坐标高亮。
- OCR。
- 多设备同步。
- 卡片导出。
- 复杂记忆模型预测。
- RAG。
- 播客。
- 动画。
- `knowledge / podcast / animation / points / export` 入口。

## 依赖文档

- `docs/spec.md`
- `docs/architecture.md`
- `docs/modules/documents.md`
- `docs/modules/cards.md`
- `docs/modules/study.md`
- `docs/ui.md`
- `docs/mvps/mvp-0.md`
- `docs/mvps/mvp-1.md`

## 实施顺序

### 1. 数据权威

复用 MVP-0 和 MVP-1 数据：

```text
documents
document_chunks
source_anchors
cards
card_groups
review_states
study_events
background_jobs
```

要求：

- Reader 右侧卡片由 `SourceAnchor -> Card` 查询得到。
- 学习统计以 `study_events` 为事实来源。
- 如需统计缓存，缓存必须能从 `study_events` 重建。
- MVP-2 不新增冻结功能表。

### 2. Rust/Tauri IPC 与 gateway

实现 MVP-2 所需命令：

- 获取 PDF 文件可读路径或安全访问句柄。
- 查询当前文档页码范围内的卡片。
- 查询卡片来源页码和 source quote。
- 查询首页学习统计。
- 查询学习热力图。
- 查询文档进度。
- 查询分组进度。

### 3. Python orchestration

MVP-2 不新增 Python 主线能力。

允许保留：

- PyMuPDF 解析。
- AI 卡片生成。

不新增：

- OCR。
- RAG。
- Docling 阻塞增强。
- TTS。
- 动画。

### 4. 前端页面

实现或打磨：

- PDF Reader。
- Reader 顶部工具条。
- Reader 右侧当前页卡片栏。
- 首页学习仪表盘。
- 学习热力图。
- 文档与分组进度卡片。
- 空、加载、失败状态。

## 数据与接口

### Reader Page Cards Query

概念输入：

```text
document_id
page_number
```

概念输出：

```text
card_id
title
front
source_page
source_quote
highlight_color optional
```

规则：

- 只返回当前页相关卡片。
- 关联依据是 source anchor 的页码和文档 ID。
- MVP 不要求 bbox 精确定位。

### Study Dashboard Query

概念输出：

```text
today_completed_count
total_study_minutes
streak_days
heatmap_days
document_progress
group_progress
```

规则：

- 统计以 `study_events` 为事实来源。
- 文档进度可由文档关联卡片的 ReviewState 汇总。
- 分组进度可由分组内卡片的 ReviewState 汇总。

## 前端任务

### Reader

- 使用 `pdfjs-dist` 自建 PDF 阅读器。
- Reader 模式隐藏主侧栏。
- 顶部工具条包含返回、标题、页码、翻页、缩放。
- 主区域左 PDF，右当前页卡片。
- 右侧卡片显示 title、front 摘要、source page、source quote。
- 图标按钮必须有 tooltip 或 aria-label。
- 空状态显示“当前页暂无关联卡片”。
- 加载失败时显示可理解错误。

### 首页仪表盘

- 今日复习入口。
- 今日完成数。
- 总学习时长。
- 连续学习天数。
- 学习热力图。
- 最近文档。
- 文档进度。
- 分组进度。

### UI 打磨

- 遵守 `docs/ui.md`。
- 不做卡片套卡片。
- 页面 section 不默认做浮动卡片。
- 文本不溢出、不重叠。
- Reader、复习页、统计图在窄宽度下不重叠。

## Rust/Tauri 任务

- 为 Reader 提供 PDF 文件访问能力。
- 提供按 document/page 查询卡片的命令。
- 提供学习统计查询。
- 提供 heatmap 查询。
- 提供文档进度和分组进度查询。
- 确保所有统计可从 `study_events` 推导。
- 不引入 RAG 或 export 相关命令作为 MVP-2 验收项。

## Python orchestration 任务

MVP-2 无新增 Python 必做任务。

只需确保：

- MVP-0 解析结果足够支持页码级来源。
- MVP-1 AI 生成卡片带有 source page 和 source quote。

## 测试计划

### 单元测试

- 根据 document/page 查询当前页卡片。
- heatmap 色阶计算。
- 连续学习天数计算。
- 今日完成数计算。
- 文档进度计算。
- 分组进度计算。

### 集成测试

- Reader 打开 PDF 并显示页码。
- 当前页变化时右侧卡片随之更新。
- 无关联卡片时显示空状态。
- `study_events` 变化后首页统计更新。
- 统计缓存如存在，可从事件重建。

### 前端测试

- Reader 顶部工具条可翻页和缩放。
- Reader 模式隐藏主侧栏。
- 右侧卡片显示来源页码和 source quote。
- 热力图显示并有 tooltip。
- 窄宽度下 Reader、复习页和统计图不重叠。
- 冻结入口不可见。

## 验收场景

- 用户打开 PDF Reader，看到左侧 PDF 和右侧当前页相关卡片。
- 用户翻页后，右侧卡片列表按当前页更新。
- 用户点击卡片来源，能看到来源页码和 source quote。
- 当前页没有卡片时，右侧栏显示空状态。
- 用户完成复习后，首页今日完成数更新。
- 首页展示学习热力图、总学习时长、连续学习天数。
- 首页展示文档进度和分组进度。
- UI 不出现 `knowledge / podcast / animation / points / export` 入口。

## 风险与回退

- pdfjs-dist 渲染性能不足：优先稳定单页或分页渲染，不做复杂缩略图和全文预览。
- 来源定位不精确：MVP 只承诺页码和 quote，不承诺词级坐标。
- 统计口径争议：以 `study_events` 为事实来源，缓存只作为派生数据。
- 旧 UI 入口残留：先隐藏，不在 MVP-2 中删除历史代码。
