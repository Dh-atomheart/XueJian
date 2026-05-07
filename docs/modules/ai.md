# AI 模块设计

AI 模块负责 Provider 配置、卡片生成 workflow 和 AI 任务状态。AI 是辅助生产系统，不是学习资产的唯一来源。

## 目标

MVP 目标是提供可靠的 AI 卡片生成：

- 用户配置 BYOK Provider。
- 用户选择文档或页码范围。
- 用户选择目标分组和生成密度。
- 系统基于文档 chunk 生成中文 Basic 卡片。
- 生成结果通过 Pydantic schema 校验。
- 成功后自动入库，失败时不部分入库。

## 不做什么

MVP 不做：

- Agent 作为主线编排。
- 文档 RAG 问答。
- 播客脚本。
- TTS 音频。
- Manim 动画。
- 复杂预算系统。
- 多 workflow 模型分配 UI。

LangChain 相关代码冻结为后续 RAG 或 Agent 实验库存。

## 当前决策

- Provider 主路线采用 `LiteLLM`。
- MVP Provider 范围为 OpenAI、Anthropic 和 OpenAI-compatible。
- 结构化输出统一使用 Pydantic schema 校验。
- Provider 原生结构化输出能力可后续增强，但不作为 MVP 唯一依赖。
- MVP 卡片生成采用确定性 workflow。
- Rust 管理任务状态、数据库和密钥。
- Python 只执行 workflow。
- Rust 与 Python orchestration 保留本地 HTTP 通信。
- API Key 由 Rust 从 Stronghold 短时注入 Python workflow。
- MVP 卡片生成输出最小字段：`title/front/back/sourcePage/sourceQuote/sourceChunkIds/confidence/tags`。

## 核心流程

### Provider 配置

```text
用户在设置页配置 Provider
-> Rust 保存非敏感配置到 provider_configs
-> Rust 保存 API Key 到 Stronghold
-> 前端只展示 key_status
```

首启不强制配置 API Key。用户触发 AI 生成功能时再提示配置。

### AI 卡片生成

```text
用户选择文档或页码范围
-> 用户选择目标 CardGroup 和生成密度
-> Rust 创建 BackgroundJob
-> Rust 读取 Provider key 并短时注入 Python
-> Python 通过 host gateway 读取 chunk
-> Python 使用 LiteLLM 调用模型
-> Python 使用 Pydantic 校验结构化输出
-> Rust 校验来源和字段
-> Rust 写入 cards / source anchors / review states
-> job succeeded
```

失败策略：

- schema 校验失败：job failed，不部分入库。
- Provider 调用失败：job failed，展示可理解错误。
- 来源缺失：job failed，不部分入库。
- 用户取消：job cancelled，不写入卡片。

## 数据与状态

核心实体：

- `ProviderConfig`：Provider 非敏感配置和 Stronghold key ref。
- `BackgroundJob`：AI 生成任务状态。
- `DocumentChunk`：生成输入。
- `SourceAnchor`：生成来源。
- `Card`：生成输出。

关系：

```text
ProviderConfig -> AI model calls
DocumentChunk -> SourceAnchor -> Card
BackgroundJob -> Card generation workflow
```

`ProviderConfig` 概念字段：

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

字段级 schema 后续由数据库 baseline 文档确定。

## 与其他模块的边界

- Documents 提供 chunk 和来源。
- Cards 接收校验后的卡片并负责长期管理。
- Study 只消费已入库卡片，不依赖 AI。
- Settings 管理 Provider 配置和 key 状态。
- Rust/SQLite 是数据权威，Python 不直接写库。

## MVP 验收场景

- 用户可以配置 OpenAI Provider。
- 用户可以配置 Anthropic Provider。
- 用户可以配置 OpenAI-compatible Provider。
- API Key 保存到 Stronghold，不进入 SQLite。
- 用户选择文档范围后可以生成中文卡片。
- 生成卡片包含 title/front/back/sourcePage/sourceQuote。
- schema 校验失败时任务失败且不部分入库。
- Provider 失败时 UI 展示可理解错误。

## 后续待细化问题

- AI 卡片生成 Pydantic schema。
- LiteLLM Provider 参数映射。
- Provider 错误分类。
- prompt 模板和生成密度定义。
- token 用量统计和预算提示。
- RAG、播客脚本和 TTS workflow 契约。
