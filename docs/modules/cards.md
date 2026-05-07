# Cards 模块设计

Cards 模块负责学习资产本身。卡片是 PDF、AI、分组和复习之间的核心对象。

## 目标

MVP 目标是提供简单、稳定、可编辑的 Basic 闪卡系统：

- 用户可以新增、编辑、删除卡片。
- AI 生成卡片后直接入库。
- 卡片可归入全局分组。
- 卡片保存来源，能回到 PDF 页码和文本片段。
- 卡片支持 Markdown + KaTeX 展示。
- 卡片列表支持多选和批量删除，用于补救 AI 自动入库的质量问题。

## 不做什么

MVP 不做：

- 完整 Anki note/card type 系统。
- Cloze。
- choice。
- image occlusion。
- 卡片媒体附件。
- APKG 导入导出。
- 卡片簇和知识图谱。
- AI 生成批次撤销。
- `card_candidates` 候选审核流。

## 当前决策

- MVP 只做 Basic 单卡型。
- 字段收敛为 `title/front/back/source/tags/group`。
- `front/back` 支持 Markdown + KaTeX。
- `CardGroup` 是全局学习单位，不强绑定单一文档。
- AI 生成卡必须有来源。
- 手动卡来源可空。
- tags 是轻量筛选能力，不作为学习单位。
- AI 生成成功后直接写入 `cards`。
- 卡片采用软删除。
- 去重范围为同一分组内的 `front/back`。

## 核心流程

### 手动建卡

```text
用户创建卡片
-> 输入 title/front/back
-> 可选选择 group、tags、source
-> Rust 校验并写入 cards
-> 初始化 ReviewState
```

手动卡允许没有来源，但 UI 应鼓励用户绑定文档来源。

### AI 自动入库

```text
AI workflow 生成结构化卡片
-> Rust 校验来源和字段
-> 写入 cards
-> 绑定 SourceAnchor
-> 归入目标 CardGroup
-> 初始化 ReviewState
```

AI 生成任务失败时不部分入库。生成质量问题由用户编辑、删除或批量删除处理。

### 卡片管理

卡片列表需要支持：

- 按分组筛选。
- 按文档来源筛选。
- 按 tags 筛选。
- 搜索 front/back/title。
- 多选。
- 批量删除。

## 数据与状态

核心实体：

- `Card`：学习卡片。
- `CardGroup`：全局学习单位。
- `SourceAnchor`：卡片来源。
- `ReviewState`：卡片复习状态。

关系：

```text
SourceAnchor -> Card
Card -> CardGroup
Card -> ReviewState
```

建议 Card 概念字段：

```text
id
title
front
back
source_anchor_id?
group_id?
tags
deleted_at?
created_at
updated_at
```

字段级 schema 后续由数据库 baseline 文档确定。

## 与其他模块的边界

- Documents 提供来源，不负责卡片编辑。
- AI 负责生成结构化卡片数据，不拥有卡片状态。
- Study 基于 CardGroup 和 ReviewState 组织复习。
- Settings 只影响默认生成配置和展示偏好，不改变卡片权威模型。

## MVP 验收场景

- 用户可以创建一张无来源手动卡。
- 用户可以编辑 `title/front/back/group/tags`。
- 用户可以删除卡片，删除采用软删除。
- AI 生成的卡片必须能看到来源页码和文本片段。
- 用户可以把卡片加入或移出分组。
- 用户可以批量删除一组 AI 生成质量不佳的卡片。
- 同一分组内重复 `front/back` 的卡片应被拦截或提示。

## 后续待细化问题

- Markdown + KaTeX 渲染组件。
- tags 存储形态。
- 卡片搜索与 FTS 规则。
- 批量操作的确认和撤销体验。
- AI 生成卡片的置信度展示策略。
