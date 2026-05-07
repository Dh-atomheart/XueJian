# MVP-0：无 AI 的本地学习闭环

## 目标

MVP-0 的目标是在没有 AI、没有 BYOK、没有 Reader 右侧联动的情况下，跑通最小本地学习闭环：

```text
PDF 导入 -> 文档解析 -> 手动卡片 -> 分组管理 -> 每日复习 -> 学习事件
```

这一阶段验证本地数据权威、文档库、卡片系统、分组、复习调度和主导航是否成立。

## 完成定义

MVP-0 完成时，用户应能：

- 导入一个可复制文本 PDF。
- 在本地应用库中保存该 PDF 的副本。
- 看到文档解析状态。
- 手动创建、编辑、删除 Basic 卡片。
- 创建、编辑、删除、启用、暂停分组。
- 将卡片归入分组。
- 从启用分组中开始每日复习。
- 使用四档反馈：`忘记 / 模糊 / 记得 / 熟练`。
- 每次反馈后更新下一次复习时间，并写入 `study_events`。

## 不做什么

MVP-0 明确不做：

- AI 卡片生成。
- BYOK。
- Provider 配置。
- PDF Reader 右侧卡片联动。
- 学习统计增强。
- OCR。
- RAG。
- 播客。
- 动画。
- 导出。
- 多设备同步。
- `knowledge / podcast / animation / points / export / profile` 入口。

## 依赖文档

- `docs/spec.md`
- `docs/architecture.md`
- `docs/modules/documents.md`
- `docs/modules/cards.md`
- `docs/modules/study.md`
- `docs/ui.md`

## 实施顺序

### 1. 数据权威

建立新的 `V1` database baseline。MVP-0 最小核心表：

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

- Rust/SQLite 是唯一数据权威。
- 主键使用 UUID 文本。
- 时间使用 UTC ISO 字符串。
- 核心业务数据软删除。
- SQLite 开启 foreign keys。
- 冻结功能相关表不进入 MVP-0 baseline。

### 2. Rust/Tauri IPC 与 gateway

实现 MVP-0 所需命令：

- 导入 PDF。
- 查询文档列表和文档详情。
- 查询文档解析状态。
- 创建、更新、删除卡片。
- 查询卡片列表。
- 创建、更新、删除分组。
- 启用、暂停分组。
- 查询今日复习队列。
- 提交复习反馈。
- 查询基础学习事件或当日复习结果。

### 3. Python orchestration

MVP-0 只需要文档解析：

- 使用 PyMuPDF 解析可复制文本 PDF。
- 生成页面文本和 chunk。
- 返回页码、文本片段和可选 bbox。
- 不直接写 SQLite。
- 解析结果由 Rust 校验并落库。

### 4. 前端页面

主导航收敛为：

```text
首页 / 文档 / 卡片 / 学习 / 设置
```

页面要求：

- 首页：基础仪表盘，展示今日复习入口和简要状态。
- 文档页：PDF 导入、文档列表、解析状态、错误提示。
- 卡片页：卡片列表、手动建卡、编辑、删除、分组筛选。
- 学习页：每日队列、卡片翻面、四档反馈、进度。
- 设置页：学习上限和通用设置占位；不强制 API Key。

## 数据与接口

### Document

MVP-0 至少支持：

- 文档 ID。
- 标题。
- 文件 hash。
- 应用库路径。
- 页数。
- 解析状态。
- 创建时间。
- 更新时间。

### DocumentChunk / SourceAnchor

MVP-0 至少支持：

- 文档 ID。
- 页码或页码范围。
- chunk 顺序。
- 文本。
- quote。
- 可选 bbox。

### Card / CardGroup

MVP-0 只做 Basic 单卡型：

```text
title
front
back
source optional
tags
group
```

手动卡来源可空。卡片删除使用软删除。

### ReviewState / StudyEvent

要求：

- 四档反馈映射为 `again / hard / good / easy`。
- 今日队列只来自启用分组。
- 默认每日新卡 20。
- 默认每日复习 100。
- 每次提交反馈必须写入 `study_events`。
- `ReviewState` 由 Rust 后端调度逻辑更新。

## 前端任务

- 隐藏 `knowledge / podcast / animation / points / export / profile` 入口。
- 建立五项主导航。
- 文档页实现导入按钮、文档列表、解析状态、失败状态。
- 卡片页实现 Basic 卡片 CRUD 和分组筛选。
- 学习页实现翻面和四档反馈。
- 设置页保留 `学习 / 通用` 基础设置；AI tab 可隐藏或禁用提示“下一阶段启用”。
- 所有主页面实现 empty、loading、failed 状态。

## Rust/Tauri 任务

- 建立 `V1` baseline。
- 建立 documents/cards/study/background_jobs 领域命令。
- 实现 PDF 文件复制到应用数据目录。
- 实现 hash 去重。
- 实现 `BackgroundJob` 状态：`queued / running / succeeded / failed / cancelled`。
- 实现 ReviewState 更新逻辑。
- 实现 StudyEvent 追加写入。
- 确保 Python 不直接访问 SQLite。

## Python orchestration 任务

- 提供 PyMuPDF 解析入口。
- 只支持 PDF。
- 对扫描版或不可复制文本 PDF 返回可理解失败。
- 输出结构化解析结果给 Rust。
- 不引入 OCR。
- 不引入 Docling 阻塞导入流程。

## 测试计划

### 单元测试

- hash 去重。
- 卡片 CRUD。
- 分组启用/暂停。
- 四档反馈映射。
- ReviewState 更新。
- StudyEvent 写入。

### 集成测试

- 导入可复制文本 PDF 后创建 Document、chunk 和 source anchor。
- 解析失败时 `BackgroundJob` 为 failed。
- 暂停分组后，该分组卡片不进入今日复习。
- 提交复习反馈后下一次复习时间变化。

### 前端测试

- 主导航只显示五项。
- 文档页空状态和导入状态。
- 卡片页新增、编辑、删除。
- 学习页翻面和四档反馈。
- 冻结入口不可见。

## 验收场景

- 用户导入一个可复制文本 PDF，应用复制文件到本地应用库，并生成文档记录。
- 同一 PDF 重复导入时，系统识别 hash 重复并提示。
- 用户手动创建一张无来源 Basic 卡片。
- 用户创建一个分组并将卡片加入该分组。
- 用户暂停分组后，该分组卡片不进入今日复习。
- 用户启用分组后，到期卡片进入今日复习。
- 用户完成四档反馈后，系统更新下一次复习时间并写入 `study_events`。
- UI 不出现 `knowledge / podcast / animation / points / export / profile` 入口。

## 风险与回退

- PyMuPDF 解析失败：保留 Document 和 failed job，提示“该 PDF 可能是扫描版或文本不可复制”。
- Rust FSRS crate 未确定：先实现等价后端调度接口，保持 `ReviewState` 字段兼容 FSRS。
- 旧 migrations 过多：MVP-0 使用新 `V1` baseline，不兼容旧开发数据。
- UI 历史入口残留：先隐藏入口，不立即删除历史代码。
