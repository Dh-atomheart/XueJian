# MVP-1：AI 卡片生成与 BYOK

## 目标

MVP-1 在 MVP-0 的稳定本地学习闭环上加入 AI 卡片生成和 BYOK，让用户可以从 PDF 文本自动生成中文 Basic 卡片。

```text
DocumentChunk -> AI workflow -> Pydantic 校验 -> Card 自动入库 -> ReviewState 初始化
```

## 完成定义

MVP-1 完成时，用户应能：

- 配置 OpenAI、Anthropic 或 OpenAI-compatible Provider。
- 将 API Key 保存到 Stronghold。
- 从整篇 PDF 或页码范围生成中文卡片。
- 选择生成密度：少 / 中 / 多。
- 选择目标 CardGroup。
- 看到 AI 生成任务状态。
- 在任务成功后看到卡片自动入库。
- 在生成失败时看到可理解错误，且没有部分脏数据入库。

## 不做什么

MVP-1 明确不做：

- Agent 主线编排。
- RAG 问答。
- 播客脚本。
- TTS 音频。
- Manim 动画。
- 草稿审核系统。
- `card_candidates` 候选表。
- 复杂卡片质量评分。
- 成本预算系统。
- 多 workflow 模型分配 UI。
- `knowledge / podcast / animation / points / export` 入口。

## 依赖文档

- `docs/spec.md`
- `docs/architecture.md`
- `docs/modules/ai.md`
- `docs/modules/documents.md`
- `docs/modules/cards.md`
- `docs/ui.md`
- `docs/mvps/mvp-0.md`

## 实施顺序

### 1. 数据权威

在 MVP-0 baseline 上增加或启用：

```text
provider_configs
background_jobs
```

要求：

- `provider_configs` 只保存非敏感配置和 Stronghold key ref。
- API Key 不进入 SQLite。
- AI 生成任务全部进入 `background_jobs`。
- AI 生成卡片必须绑定来源。

### 2. Rust/Tauri IPC 与 gateway

实现 MVP-1 所需命令：

- 创建、更新、删除 ProviderConfig。
- 设置默认 Provider。
- 保存、验证、删除 API Key。
- 查询 key status。
- 创建 AI 卡片生成任务。
- 查询任务状态。
- 取消生成任务。
- 读取文档 chunk 给 Python workflow。
- 接收 Python 生成结果并校验落库。

### 3. Python orchestration

实现确定性卡片生成 workflow：

- 使用 LiteLLM 调用 Provider。
- 支持 OpenAI、Anthropic、OpenAI-compatible。
- 使用 Pydantic schema 校验结构化输出。
- 根据整篇文档或页码范围读取 chunk。
- 根据生成密度控制目标卡片数量。
- 输出最小字段：`title/front/back/sourcePage/sourceQuote/sourceChunkIds/confidence/tags`。
- 不直接写 SQLite。
- 不持久化 API Key。

### 4. 前端页面

新增或完善：

- 设置页 AI tab。
- 文档页“生成卡片”入口。
- 生成参数面板：范围、密度、目标分组、Provider。
- 后台任务状态展示。
- Provider 未配置提示。
- 生成失败错误展示。
- 卡片页批量删除，作为 AI 自动入库的补救机制。

## 数据与接口

### ProviderConfig

概念字段：

```text
name
provider
protocol
base_url
model
key_status
default
stronghold_key_ref
```

Provider 范围：

- OpenAI。
- Anthropic。
- OpenAI-compatible。

### AI Generate Cards Input

概念输入：

```text
document_id
page_range optional
card_group_id
density: low | medium | high
provider_config_id
language: zh
```

### AI Generate Cards Output

概念输出：

```text
title
front
back
sourcePage
sourceQuote
sourceChunkIds
confidence
tags
```

Rust 落库前必须校验：

- 来源页码存在。
- sourceQuote 非空。
- sourceChunkIds 属于目标文档。
- front/back 非空。
- 目标 CardGroup 存在。

## 前端任务

- 设置页保留 `AI / 学习 / 通用` 三个 tab。
- AI tab 支持 Provider 列表和编辑。
- API Key 输入后只显示 key status，不回显明文。
- 文档页支持整篇或页码范围生成。
- 生成密度使用少 / 中 / 多。
- 目标分组必须选择或创建。
- 后台任务展示 `queued / running / succeeded / failed / cancelled`。
- 失败状态展示可理解错误和重试入口。
- 卡片页支持多选和批量删除。

## Rust/Tauri 任务

- 复用 Stronghold 密钥存储。
- `provider_configs` 只保存非敏感字段。
- 创建 AI `BackgroundJob`。
- 从 Stronghold 读取 API Key 并短时注入 Python workflow。
- 通过 host gateway 向 Python 提供 chunk 读取能力。
- 接收 Python 输出并进行二次校验。
- 生成成功后写入 `cards / source_anchors / review_states`。
- schema 或来源校验失败时，job failed 且不部分入库。

## Python orchestration 任务

- 接入 LiteLLM。
- 定义 Pydantic schema。
- 实现确定性 prompt 和 workflow。
- 支持 OpenAI、Anthropic、OpenAI-compatible。
- 支持页码范围过滤 chunk。
- 支持生成密度。
- 返回结构化结果和可理解错误。
- 不使用 LangChain 作为主线。

## 测试计划

### 单元测试

- ProviderConfig 非敏感字段保存。
- Stronghold key status 更新。
- AI 输出 Pydantic schema 校验。
- 生成密度到目标数量的映射。
- Rust 来源校验。

### 集成测试

- Provider 未配置时，文档页生成入口提示配置。
- 使用 mock Provider 成功生成卡片并自动入库。
- schema 校验失败时不入库。
- Provider 调用失败时 job failed。
- 取消任务后不入库。

### 前端测试

- 设置页 AI tab 可添加 Provider。
- API Key 不回显。
- 文档页可选择页码范围、密度、分组。
- 任务状态正确展示。
- 卡片页可批量删除生成结果。

## 验收场景

- 用户配置 OpenAI Provider，API Key 保存到 Stronghold。
- 用户配置 Anthropic Provider，SQLite 不保存明文 key。
- 用户选择整篇 PDF，设置中等密度，生成中文卡片。
- 用户选择页码范围，生成卡片只来自该范围。
- AI 生成卡片自动加入目标分组。
- 每张 AI 卡显示来源页码和 source quote。
- Provider 调用失败时任务失败，不部分入库。
- Pydantic schema 校验失败时任务失败，不部分入库。
- UI 不出现 `knowledge / podcast / animation / points / export` 入口。

## 风险与回退

- Provider API 差异：MVP 统一走 LiteLLM 和 Pydantic 校验，不依赖单一 Provider 原生 JSON schema。
- 模型输出不稳定：失败时 job failed，不自动修复入库。
- 生成质量不佳：用卡片列表批量删除补救，不引入候选审核系统。
- 密钥泄露风险：明文 key 不写 SQLite、payload、日志和错误信息。
